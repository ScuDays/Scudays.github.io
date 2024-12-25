---
title: Lec13：Sleep & Wake up (Robert)
date: 2024-11-08 00:39:59
modify: 2024-12-22 16:41:09
author: days
category: 6S081
published: 2024-12-22
---
# Lec13：Sleep & Wake up (Robert)
**介绍 OS调度中 sleep 与 wakeup 的机制，以及其他用到这个机制的系统调用，如 kill ，exit 和 wait。**

## 回顾 线程调度
**重新回顾上节课的重点，一个线程开始让出 CPU 时，其 p->lock 保护 p->state 的过程是跨线程的，也就是跨 swtch 调用。 过程基本如下，**

```c
yield:
    acquire(&p->lock);
    p->state = RUNNABLE;
    swtch();
scheduler:
    swtch();
    release(&p->lock);
```

### 为什么需要在 swtch() 时持有锁 why hold p->lock across swtch()? 
**跨 swtch() 调用持有 p->lock 的核心原因是，防止另一个CPU核心的 scheduler 看到 p->state == RUNNABLE后直接运行该线程，直到原线程的CPU核心停止执行线程并停止使用线程的堆栈(即在 swtch() 之后)。**

### 为什么 sched() 禁止在让出 CPU 时保留自旋锁？ why does sched() forbid spinlocks from being held when yielding the CPU?

在 sched() 准备调用 swtch 让出 CPU 切换线程前，会检查其他自旋锁是否被持有。**这是为了防止死锁。**

**防止进程获取了锁后进入睡眠，永远无法释放锁，导致死锁。**

例子：设想在单CPU系统上，

| **P1：** | **P2：** |
| --- | --- |
| **acq(L)** | **** |
| **sched()** | **** |
|  | **acq(L)** |

P2会一直自旋，直到P1释放锁；但 P2不会释放CPU，因为 P1 除非再次运行否则不会释放锁。在单核系统上，CPU被 P2 永远占据了。

多核系统中，这种死锁也可能会出现，试想更多线程 acq(L) 并调度，它们也占据了所有 CPU ，使得 P1 永远没机会释放锁。

于是，更多的自旋锁必须涉及到统一的解决方案，即不要持有自旋锁并放弃CPU。p.s. 除了 p->lock ，其会在 scheduler 线程中被释放。

## Sleep and wakeup 
**线程在运行时需要等待特定的事件或条件:**

+ 等待磁盘读取完成(事件来自中断)
+ 等待管道写入器产生数据(事件来自线程)
+ 等待任何子程序退出

**协调线程，在于如何“等待”。**

**如果单纯的 while(predicate()) ; 自旋可能会白白消耗时间片。**

**更好的解决方案:产生CPU的协调原语，例如屏障，信号量，事件队列。Xv6使用**`**sleep and wakeup**`**机制。**

### 信号量 semaphores

虽然 xv6 没有使用 semaphores 信号量。但 sleep and wakeup机制可以用作实现信号量。信号量维护一个计数并提供两个操作。V操作(对于生产者)增加计数。P操作(针对消费者)等待计数非零，然后对其递减并返回。

### 初步 sleep 想法：自旋-忙等待 busy waiting

一个简单的实现如下，

```c
struct semaphore {
    struct spinlock lock;
    int count;
};

void
V(struct semaphore *s)
{
    acquire(&s->lock);
    s->count += 1;
    release(&s->lock);
}
void
P(struct semaphore *s)
{
    while(s->count == 0)
        ;
    acquire(&s->lock);
    s->count -= 1;
    release(&s->lock);
} 
```

**但正如之前所说，这个实现是代价高昂。因为如果生产者很少行动，消费者将花大部分时间在while循环中自旋，希望得到一个非零计数。消费者的CPU可能会找到比重复轮询 s->count 更高效的工作。为了避免这种繁忙的等待，需要一种方法让消费者交出CPU，并在V增加计数后才恢复。**

### 尝试让出 CPU 提高性能 yield CPU
**现在有一对调用，sleep and wakeup。**

1. **sleep(chan) 会让调用它的线程在指定的通道 chan 上进入休眠状态，并释放 CPU 资源给其他任务使用。**
2. **wakeup(chan) 会唤醒所有在 chan 上等待的线程，让它们继续执行。如果没有线程在等待，则此操作无效果。**

**现在考虑修改 P 与 V 操作，将空循环改为使用sleep 。**

```c
void
V(struct semaphore *s)
{
    acquire(&s->lock);
    s->count += 1;
    wakeup(s);
    release(&s->lock);
}

void
P(struct semaphore *s)
{
    while(s->count == 0)
        sleep(s);
    acquire(&s->lock);
    s->count -= 1;
    release(&s->lock);
} 
```

**但这样的P 操作仍有问题，它有可能错过 wakeup ，即 lost wake-up problem 。**

因为函数 P 中，语句 while(s->count == 0) 与 sleep(s) 不是原子的，假设消费者先检查条件，然后在调用 sleep 前，生产者线程调用了 wakeup 进行唤醒，此时是没有进程在休眠的，如此消费者会错过这个唤醒。指令产生了如下的交错执行，

| **consumer(P)** | **producer(V)** |
| --- | --- |
| **while(s->count == 0)** | **** |
| **** | **wakeup(s)** |
| **sleep(s)** | **** |

### 解决错过唤醒 lost wakeup 
**为了不错过唤醒，最简单的想法，那就是用acquire(&s->lock);使用锁将 while(s->count == 0) sleep(s); 保护起来，使其不可分割就好。**

```c
V(struct semaphore *s)
{
  acquire(&s->lock);
  s->count += 1;
  wakeup(s);
  release(&s->lock);
}

void
P(struct semaphore *s)
{
  acquire(&s->lock);
  while(s->count == 0)
    sleep(s);
  s->count -= 1;
  release(&s->lock);
} 
```

**这个很接近最终的答案了，但仍有问题。因为 sleep 会让出CPU，而在 why does sched() forbid spinlocks from being held when yielding the CPU? 小节提到，持有自旋锁并让出CPU，是会带来死锁的。**

### 为什么 sleep()需要传递保护数据的锁？ why the lock argument to sleep()?
1. **<font style="background-color:#FBDE28;">为了避免死锁，在 </font>**`**<font style="background-color:#FBDE28;">sleep()</font>**`**<font style="background-color:#FBDE28;">中再释放掉相关锁</font>****，**

**这也是 sleep 相关实现有锁参数的原因。**

```c
V(struct semaphore *s)
{
  acquire(&s->lock);
  s->count += 1;
  wakeup(s);
  release(&s->lock);
}

void
P(struct semaphore *s)
{
  acquire(&s->lock);
  while(s->count == 0)
    sleep(s, &s->lock);
  s->count -= 1;
  release(&s->lock);
} 
```

**仔细看 xv6 的实现**

```c
// Atomically release lock and sleep on chan.
// Reacquires lock when awakened.
void
sleep(void *chan, struct spinlock *lk)
{
  struct proc *p = myproc();
  // Must acquire p->lock in order to
  // change p->state and then call sched.
  // Once we hold p->lock, we can be
  // guaranteed that we won't miss any wakeup
  // (wakeup locks p->lock),
  // so it's okay to release lk.
  acquire(&p->lock);  //DOC: sleeplock1
  release(lk);
  // Go to sleep.
  p->chan = chan;
  p->state = SLEEPING;
  sched();
  // Tidy up.
  p->chan = 0;
  // Reacquire original lock.
  release(&p->lock);
  acquire(lk);
}
// Wake up all processes sleeping on chan.
// Must be called without any p->lock.
void
wakeup(void *chan)
{
  struct proc *p;

  for(p = proc; p < &proc[NPROC]; p++) {
    if(p != myproc()){
      acquire(&p->lock);
      if(p->state == SLEEPING && p->chan == chan) {
        p->state = RUNNABLE;
      }
      release(&p->lock);
    }
  }
} 
```

1. **sleep 在让出 CPU 前释放了相关锁，持有 p->lock然后改变p->chan 与 p->state ，****然后调用switch 函数切换到调度器线程，调度器线程再释放进程锁。**
2. **wakeup 也是遍历所有相同等待条件并 SLEEPING 的线程，修改其 p->state 以便 scheduler 线程唤醒。**
3. **而 sleep 从 sched() 调用中返回后（即被唤醒），重新获取原相关锁，以便后续代码仍被相关锁保护的。**

**从以上不难看出，sleep and wakeup 机制有两个关键，**

1. **没有错过唤醒，所以 sleep 写 p->state 需要在 wakeup 的写之前发生，这个序列用锁来保证。**
2. **让出CPU却不死锁，在 sleep 获取 p->lock 后释放其他锁。**

## 如何在 xv6 中终止线程？
**使用 sleep and wakeup 机制的系统调用有很多**，如 pipe 与 wait 等。因为总有工作是需要休眠让出 CPU 等待的，这就有 sleep lock 的用武之地。一个常见的场景就是进程如何退出，这个过程总伴随着资源的回收。

**一个进程 X 要真的让另一个进程 Y 退出是困难的，需要考虑一些细节，**

+ **Y 可能在另一个 CPU 上运行。**
+ **Y 可能持有锁（其他相关资源）。**
+ **Y 可能正在修改某些数据结构，需要保证数据结构的 invariant 所以不能改到一半。**

而**进程想自己回收全部资源也是不现实的，**

+ **进程无法回收自己的栈，因为它自己正在用**
+ **进程无法回收 struct context 可能需要调用 swtch**

所以 xv6 使用两种方式回收资源，即 **exit **与 **kill **两类。

### 进程使用exit()

普通进程自愿退出，调用 exit 系统调用。本质上，这会使得资源一部分在 exit 中回收，一部分在 wait 回收。

**在 exit 中基本的工作是，**

1. ** 关闭打开的文件**
2. **将子进程的父进程ID更改为1（init）**
3. **唤醒正在等待的父进程 p->state = ZOMBIE**

**现在处于一个状态**

+ **处于死亡但尚未被完全清理**
+ **不会再次运行**
+ **该进程还不会被fork()重新分配（注意堆栈和proc[]条目仍然被分配……）**
4. **然后切换到调度器**

在 wait 中基本工作是，

+ sleep() 等待任意子进程退出
+ 扫描 proc[] 表查找状态为 ZOMBIE 的子进程
+ 调用 freeproc()（持有 p->lock...）释放 trapframe, pagetable, ...，并将 p->state 设置为 UNUSED

每个进程都需要被 wait 以回收资源，所以 re-parent 使得进程有父进程回收也很重要。

### 进程使用kill(pid)杀死某个进程

如上面提到的，强制让一个进程退出是危险的，其中并发、数据的一致性与资源回收都很重要。

所以系统调用 **kill** 其实只是设置 **p->killed** 标志，目标进程陷入内核时检查到这个标志会调用 **exit(-1)** 开始退出（在 usertrap 中）。

如果 kill 的目标进程在休眠中，似乎此时该进程既没有执行，又没有持有锁，直接销毁目标进程似乎是可行的。但是，

+ **如果进程 sleeping 是在等待 console input 那可以直接销毁**
+ **但如果进程是等待磁盘的文件创建等工作，这就会产生错误。磁盘写到一半，直接销毁进程会失去一致性。**

**为了解决这个问题，在 xv6 的 kill 实现还会类似 wakeup()实现，将 p->state 从 SLEEPING 状态改为 RUNNABLE。以便让休眠中的进程在条件完成前返回。**

```c
// in kernel/pro.c file
// Kill the process with the given pid.
// The victim won't exit until it tries to return
// to user space (see usertrap() in trap.c).
int
kill(int pid)
{
  struct proc *p;

  for(p = proc; p < &proc[NPROC]; p++){
    acquire(&p->lock);
    if(p->pid == pid){
      p->killed = 1;
      if(p->state == SLEEPING){
        // Wake process from sleep().
        p->state = RUNNABLE;
      }
      release(&p->lock);
      return 0;
    }
    release(&p->lock);
  }
  return -1;
} 
```

+ **有些使用 sleep 等待的函数会检查 p->killed **

**例如： piperead() 与 consoleread() 系统调用，否则读操作可能永远等待一个被 killed 的进程。如果p->killed == 1则 return返回到usertrap()中，usertrap()中会检查 p->killed并调用exit()退出**

+ ** 有些使用 sleep 等待的进程不会检查p->killed **

**例如： virtio_disk.c 中相关函数，因为确实需要等待磁盘 IO 的完成。****这个过程涉及到多次读写磁盘。我们希望完成所有的文件系统操作，完成整个系统调用。之后再检查p->killed并退出。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/483945095ebcc7092c4a3d8251ec3e02.png)

**所以kill系统调用并不是真正的立即停止进程的运行，而是继续完成现在的任务或者根据判断返回，但进程并未被停止，一直运行****直到 usertrap()函数中 检查 p->killed 后调用 exit(-1)才会停止。**

**具体****：**

+ **目标进程在用户态，进程在下一次系统调用或异常或中断（通常是计时器中断先来）中，调用 exit(-1) 退出。**
+ **目标进程在内核态，将没有机会执行用户指令，但可能停留在内核态“一段时间”，等待唤醒并 exit()。**

## Real World
### 自旋锁和互斥锁性能对比
**自旋锁比互斥锁效率更高的原因主要是因为自旋锁在等待锁释放时不会导致线程进入睡眠状态，从而避免了操作系统进行线程上下文切换的开销。因此，在锁的持有时间非常短的情况下，使用自旋锁可以减少延迟和提高程序的执行效率。  **

**详细对比：**

+ **上下文切换成本**：
    - 自旋锁适用于锁持有时间非常短的场景，因为线程在等待获取锁时不会被挂起，从而避免了上下文切换的开销。上下文切换涉及保存和恢复线程状态，切换到操作系统内核模式等操作，这些都是相对耗时的操作。
    - 互斥锁在锁被占用时通常会导致线程睡眠，这涉及到线程的上下文切换，尤其是在高并发情况下，频繁的上下文切换会显著降低系统的整体性能。
+ **等待时间和响应性**：
    - 在锁被频繁且快速地获取和释放的环境中，自旋锁允许线程立即检测到锁的释放，从而快速响应。
    - 对于互斥锁，线程被唤醒和重新调度可能会有明显的延迟，尤其是在系统负载较高时。
+ **CPU资源的使用**：
    - 自旋锁在等待锁的过程中会一直占用 CPU，这在多核处理器上不是问题，但在单核处理器上可能会导致明显的性能问题。
    - 互斥锁通过使线程进入睡眠状态，可以释放 CPU 资源供其他线程使用，这在资源受限的环境中更为合理。

### xv6的调度策略很简单

xv6调度器实现了一个简单的调度策略，该策略依次运行每个进程。这种策略称为轮询。真正的操作系统实现更复杂的策略，例如，允许进程具有优先级。其思想是调度器将优先考虑可运行的高优先级进程而不是可运行的低优先级进程。这些策略可能很快变得复杂，因为经常存在相互竞争的目标:例如，操作可能还希望保证公平性和高吞吐量。

复杂的策略可能导致一些进程间的交互，如优先级反转和护送(priority inversion and convoys)。 当低优先级进程和高优先级进程都使用特定的锁时，可能会发生优先级反转，当低优先级进程获得该锁时，可能会阻止高优先级进程继续进行。当许多高优先级进程正在等待一个获得共享锁的低优先级进程时，可能会形成一个长长的等待进程队列；而队列一旦形成，就可以持续很长时间。为了避免这类问题，调度器需要额外的机制。

### 其他同步方法

sleep 和 wakeup 是一种简单有效的同步方法，但还有许多其他方法。所有方法的第一个挑战都是避免 lost wake-up problem。

+ 最初的Unix内核的睡眠只是禁止中断，这是因为Unix运行在单cpu系统上。
+ 因为xv6运行在多核处理器上，所以它为睡眠添加了显式的锁。FreeBSD的 msleep 采用了同样的方法。
+ Plan 9的睡眠使用一个回调函数，在持有相关锁且在写 SLEEPING 前调用回调函数。该函数可以作为 sleep 的最后检查，以避免错过唤醒。
+ Linux kernel 的 sleep 实现使用一个显式的进程队列，称为等待队列，而不是等待通道 chan；这个队列有自己的内部锁。

像 xv6 在 wakeup 中扫描所有进程集是低效的。更好的解决方案是用一个数据结构替换 sleep and wakeup 使用的 chan，该数据结构保存所有在该结构上休眠的进程列表，

+ 例如Linux的等待队列。
+ Plan 9的 sleep and wakeup 会构造一个 rendezvous point or Rendez 集合点。
+ 许多线程库会使用相同的结构作为条件变量；在该上下文中，操作睡眠和唤醒被称为 wait 和 signal。所
+ 有这些机制都具有相同的特点：睡眠的条件由在睡眠期间原子地释放的锁保护。

同理，真正的操作系统会在常数时间内找到具有显式空闲列表的空闲proc结构，而不是在allocproc中进行线性时间搜索；为了简单起见，Xv6使用线性扫描。

### **惊群效应 **thunder herd

xv6的wakeup实现会唤醒正在等待特定通道的所有进程，可能有许多进程正在等待该特定通道。操作系统将调度所有这些进程，它们将竞相检查睡眠状态。这种现象有时被称为“**惊群效应**”，是最好避免的。所以大多数条件变量都有两个唤醒原语：signal 和 broadcast，前者唤醒一个特定进程，后者唤醒所有等待的进程。

### semaphores

信号量通常用于同步。该计数通常对应于管道缓冲区中可用的字节数或进程拥有的僵尸子进程数。使用显式计数作为抽象的一部分可以避免丢失唤醒的问题，因为已经发生的唤醒数量有一个显式计数。计数也避免了虚假唤醒和惊群的问题。

**除了sleep&wakeup，还有其他更高级的协调机制，比如semaphore。semaphore接口更简单，不需要提供关于锁的信息，并且其内部已经处理了lost wakeup问题，这得益于它内置的up-down计数器。这意味着使用semaphore时不必担心丢失唤醒的问题，也不需要通过接口传递condition lock。尽管semaphore在某些方面更简单，但它主要用于等待计数器变化的情况，因此不如sleep和wakeup那样通用。**

### terminating process

在xv6中，终止进程并清理进程带来了很多复杂性。在大多数操作系统中，它甚至更加复杂，因为，`killed` 进程可能在内核睡眠的深处，unwind 它的堆栈需要小心，因为调用堆栈上的每个函数可能需要做一些清理。有些语言通过提供异常机制来提供帮助，但c语言没有这些机制。p.s. 所以这也是内核难写的原因，小心回收资源。

此外，还有其他事件可以导致正在休眠的进程被唤醒，即使它所等待的事件还没有发生。例如，当一个Unix进程处于睡眠状态时，另一个进程可能向它发送一个信号。在这种情况下，进程将从中断的系统调用返回值为-1，错误码设置为EINTR。应用程序可以检查这些值并决定要做什么。由于 xv6不支持信号，因此不会产生这种复杂性。

### unsatisfactory kill in xv6

xv6 的实现仍不是完全合适的。因为有些 sleep loops 可能检查 p->killed。即使对于检查 p->killed 的 sleep loops，也存在 sleep 和 kill 之间的竞争。后者可能设置 p->killed，并试图在目标进程循环检查 p->killed后目标进程，但这在它调用睡眠之前。如果发生此问题，目标将不会注意到 p->killed，直到它所等待的条件发生。这可能是相当晚的，甚至永远不会(例如，如果目标进程正在等待来自控制台的输入，但用户不输入任何输入)。这本质上和丢失唤醒相似，是丢失了 kill 的设置 p->killed 的“唤醒”。当然，这样可以通过锁保护在 sleep loops 中保证数据一致性，这可能需要修改 sleep 实现和检查的 sleep loops 保证，读 p->killed 与写 p->state 不可分割。

## Conclusion

这节课，详细介绍了 sleep and wakeup 机制，其关键在于，

1. 没有错过唤醒，所以 sleep 写 p->state 需要在 wakeup 的写之前发生，这个序列用锁来保证。
2. 让出CPU却不死锁，在 sleep 获取 p->lock 后释放其他锁。

这也是所谓的 sleep lock 的机制，保证在写 p->state 时有锁（至少有一个），保证让出 CPU 后无锁。

许多系统调用也用到了 sleep and wakeup 机制，在涉及到 terminating 时，回收资源尤其需要注意。 xv6 的 kill 只是简单打标记，资源回收仍然交给了 exit 与 wait 系统调用处理。这个 kill 实现与一些 sleep loops 检查 p->killed 的竞争也需要注意。这在 Real world 的 unsatisfactory kill in xv6 小节有所分析。

总的看，p->lock的作用十分丰富，尤其在调度和并发中，所有与进程状态相关的保护都与其有关系，

+ 它与 p->state 一起，它防止在为新进程分配 proc[] 槽位时发生竞争。
+ 它在进程被创建或销毁时将其隐藏起来。即 p->killed 与 p->state
+ 它防止父进程的等待收集到一个已将其状态设置为 ZOMBIE 但尚未放弃 CPU 的进程。
+ 它防止另一个核心的调度器在进程将其状态设置为 RUNNABLE 后但在完成 swtch 之前决定运行该进程。
+ 它确保只有一个核心的调度器决定运行 RUNNABLE 进程。
+ 它防止定时器中断在进程处于 swtch 期间导致其放弃 CPU。因为此时中断是关闭的。
+ 与条件锁一起，它有助于防止唤醒操作忽略一个正在调用 sleep 但尚未完成放弃 CPU 的进程。只有在将 p->state 设置为 SLEEPING 并完成 swtch 后才释放 p->lock 锁。
+ 它防止被 kill 的目标进程在 kill 检查 p->pid 和设置 p->killed 之间退出并可能被重新分配。
+ 它使 kill 对 p->state 的检查和写入成为原子操作。

总之，所有其他进程与CPU能看到的状态的，就是有可能数据竞争的状态，都需要保护，

```c
 // p->lock must be held when using these:
  enum procstate state;        // Process state
  void *chan;                  // If non-zero, sleeping on chan
  int killed;                  // If non-zero, have been killed
  int xstate;                  // Exit status to be returned to parent's wait
  int pid;                     // Process ID 
```


---
title: Lab：traps
date: 2024-12-22 00:39:59
modify: 2024-12-22 16:40:24
author: days
category: 6S081
published: 2024-12-22
---
# Lab：traps
## <font style="color:rgb(51, 51, 51);">RISC-V assembly (easy)</font>
1. **理解 RISC-V 汇编**
2. **函数内联**
3. **大端小端存储**

## <font style="color:rgb(51, 51, 51);">Backtrace(moderate)</font>
### **题目：**
**backtrace 是一个****<font style="color:rgb(51, 51, 51);">存放于栈上用于指示错误发生位置的函数调用列表。</font>**

**<font style="color:rgb(51, 51, 51);">在</font>**_**<font style="color:rgb(51, 51, 51);">kernel/printf.c</font>**_**<font style="color:rgb(51, 51, 51);">中实现名为</font>****backtrace()****<font style="color:rgb(51, 51, 51);">的函数。在</font>****sys_sleep****<font style="color:rgb(51, 51, 51);">中插入一个对此函数的调用，然后运行</font>****bttest****<font style="color:rgb(51, 51, 51);">，它将会调用</font>****sys_sleep****<font style="color:rgb(51, 51, 51);">。你的输出应该如下所示：</font>**

**<font style="color:rgb(51, 51, 51);">backtrace:</font>**

**<font style="color:rgb(51, 51, 51);">0x0000000080002cda</font>**

**<font style="color:rgb(51, 51, 51);">0x0000000080002bb6</font>**

**<font style="color:rgb(51, 51, 51);">0x0000000080002898</font>**

### **解决方案：**
**<font style="color:rgb(51, 51, 51);">编译器在每一个栈帧中放置一个帧指针（frame pointer）保存调用者帧指针的地址。通过使用这些帧指针我们可以遍历栈，并在每个栈帧中打印保存的返回地址。</font>**

**<font style="color:rgb(51, 51, 51);">tips:</font>**

+ **<font style="color:rgb(51, 51, 51);">在 </font>**_**<font style="color:rgb(51, 51, 51);">kernel/defs.h </font>**_**<font style="color:rgb(51, 51, 51);">中添加 </font>****backtrace ****<font style="color:rgb(51, 51, 51);">的原型，那样你就能在</font>****sys_sleep****<font style="color:rgb(51, 51, 51);">中引用 </font>****backtrace**
+ **<font style="color:rgb(51, 51, 51);">GCC编译器将当前正在执行的函数的帧指针保存在</font>****s0****<font style="color:rgb(51, 51, 51);">寄存器，将下面的函数添加到</font>**_**<font style="color:rgb(51, 51, 51);">kernel/riscv.h（</font>**_**<font style="color:rgb(51, 51, 51);">并在</font>****backtrace****<font style="color:rgb(51, 51, 51);">中调用此函数来读取当前的帧指针。这个函数使用</font>**[_**内联汇编**_](https://gcc.gnu.org/onlinedocs/gcc/Using-Assembly-Language-with-C.html)**<font style="color:rgb(51, 51, 51);">来读取</font>**`**<font style="color:rgb(51, 51, 51);background-color:rgb(247, 247, 247);">s0</font>**`_**<font style="color:rgb(51, 51, 51);">）</font>**_
+ **<font style="color:rgb(51, 51, 51);background-color:#FBDE28;">XV6在内核中以页面对齐的地址为每个进程的栈分配一个页面</font>****<font style="color:rgb(51, 51, 51);">。你可以通过</font>****PGROUNDDOWN(fp) ****<font style="color:rgb(51, 51, 51);">和</font>**** PGROUNDUP(fp)****<font style="color:rgb(51, 51, 51);">（参见</font>**_**<font style="color:rgb(51, 51, 51);">kernel/riscv.h</font>**_**<font style="color:rgb(51, 51, 51);">）来计算栈页面的顶部和底部地址。这些数字对于</font>**`**backtrace**`**<font style="color:rgb(51, 51, 51);">终止循环是有帮助的。</font>**

```bash
static inline uint64
r_fp()
{
  uint64 x;
  asm volatile("mv %0, s0" : "=r" (x) );
  return x;
}
```

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/84129531170053244ecfc3c922278ae0.jpeg)

```bash
void backtrace()
{
  printf("backtrace:\n");
  uint64 this_fp = r_fp();
  backtrace_help(&this_fp);
  return;
}
void backtrace_help(uint64 *this_fp)
{
  // 判断是否超出栈，若超出栈，停止
  if ((PGROUNDUP(*this_fp) - PGROUNDDOWN(*this_fp)) != PGSIZE)
  {return;}
  // 返回地址保存在 -8 偏移的位置
  printf("%p\n", *(uint64 *)(*this_fp - 8));
  // 前一个帧指针保存在-16偏移的位置
  uint64 last_fp = *this_fp - 16;
  backtrace_help(&(*(uint64 *)last_fp)); // 注意这里的指针的转换为什么是必要的
  return;
}
```

## <font style="color:rgb(51, 51, 51);">Alarm(Hard)</font>
### **题目：**
**你将向XV6添加一个特性，在进程使用CPU的时间内，XV6定期向进程发出警报。这对于那些希望限制CPU 占用时间的的进程，或者计算的同时执行某些周期性操作的进程很有用。**

**更普遍的来说，你将实现用户级中断/故障处理程序的一种初级形式。**

**例如，你可以在应用程序中使用类似的一些东西处理页面故障。**

1. **<font style="color:rgb(51, 51, 51);">应当添加一个新的 </font>****sigalarm(interval, handler) ****<font style="color:rgb(51, 51, 51);">系统调用</font>**
2. **<font style="color:rgb(51, 51, 51);">如果一个程序调用了 </font>****sigalarm(n, fn)****<font style="color:rgb(51, 51, 51);">，那么程序每消耗了CPU时间达到 n 个“滴答”，内核应当使应用程序函数 </font>****fn ****<font style="color:rgb(51, 51, 51);">被调用。</font>**
3. **<font style="color:rgb(51, 51, 51);">当 </font>****fn ****<font style="color:rgb(51, 51, 51);">返回时，应用应从它离开的地方恢复执行。在XV6中，一个滴答是一段相当任意的时间单元，取决于硬件计时器生成中断的频率。</font>**
4. **<font style="color:rgb(51, 51, 51);">如果一个程序调用了 </font>****sigalarm(0, 0)****<font style="color:rgb(51, 51, 51);">，系统应当停止生成周期性的报警调用。</font>**

**第一步：****<font style="color:rgb(51, 51, 51);">invoke handler(调用处理程序)</font>**

**<font style="color:rgb(51, 51, 51);">首先修改内核以跳转到用户空间中的报警处理程序：</font>**

+ **<font style="color:rgb(51, 51, 51);">修改</font>**_**<font style="color:rgb(51, 51, 51);">Makefile </font>**_**<font style="color:rgb(51, 51, 51);">以使</font>**_**<font style="color:rgb(51, 51, 51);">alarmtest.c</font>**_**<font style="color:rgb(51, 51, 51);">被编译为xv6用户程序。</font>**
+ **<font style="color:rgb(51, 51, 51);">放入 </font>**_**<font style="color:rgb(51, 51, 51);">user/user.h </font>**_**<font style="color:rgb(51, 51, 51);">的正确声明是：</font>**

```plain
int sigalarm(int ticks, void (*handler)());
int sigreturn(void);
```

+ **<font style="color:rgb(51, 51, 51);">更新</font>**_**<font style="color:rgb(51, 51, 51);">user/usys.pl</font>**_**<font style="color:rgb(51, 51, 51);">（此文件生成</font>**_**<font style="color:rgb(51, 51, 51);">user/usys.S</font>**_**<font style="color:rgb(51, 51, 51);">）、</font>**_**<font style="color:rgb(51, 51, 51);">kernel/syscall.h</font>**_**<font style="color:rgb(51, 51, 51);">和 </font>**_**<font style="color:rgb(51, 51, 51);">kernel/syscall.c </font>**_**<font style="color:rgb(51, 51, 51);">以允许</font>****<font style="background-color:rgb(247, 247, 247);">alarmtest</font>****<font style="color:rgb(51, 51, 51);">调用</font>****<font style="background-color:rgb(247, 247, 247);">sigalarm</font>****<font style="color:rgb(51, 51, 51);">和</font>****<font style="background-color:rgb(247, 247, 247);">sigreturn</font>****<font style="color:rgb(51, 51, 51);">系统调用。</font>**
+ **<font style="color:rgb(51, 51, 51);">目前来说，你的</font>****<font style="background-color:rgb(247, 247, 247);">sys_sigreturn</font>****<font style="color:rgb(51, 51, 51);">系统调用返回应该是零。</font>**

---

+ 现在我们已经有了**<font style="background-color:rgb(247, 247, 247);">sigalarm</font>****<font style="color:rgb(51, 51, 51);">和</font>****<font style="background-color:rgb(247, 247, 247);">sigreturn</font>****<font style="color:rgb(51, 51, 51);">系统调用，但不具有实际的功能。</font>**
+ **我们需要存储****<font style="background-color:rgb(247, 247, 247);">sigalarm</font>****调用的参数**
+ **<font style="background-color:rgb(247, 247, 247);">sys_sigalarm()</font>****<font style="color:rgb(51, 51, 51);">将报警间隔和指向处理程序函数的指针存储在</font>**`**<font style="background-color:rgb(247, 247, 247);">struct proc</font>**`**<font style="color:rgb(51, 51, 51);">的新字段中（位于</font>**_**<font style="color:rgb(51, 51, 51);">kernel/proc.h</font>**_**<font style="color:rgb(51, 51, 51);">）。</font>**
+ **<font style="color:rgb(51, 51, 51);">需要在</font>****<font style="background-color:rgb(247, 247, 247);">struct proc</font>****<font style="color:rgb(51, 51, 51);">新增一个新字段。用于跟踪自上一次调用（或直到下一次调用）到进程的报警处理程序间经历了多少滴答；(用于循环,当经历了足够滴答后报警)</font>**

---

+ **现在我们已经存储了报警间隔和处理程序函数，我们需要在报警后调用处理程序**
+ **<font style="color:rgb(51, 51, 51);">每一个滴答声，硬件时钟就会强制一个中断，这个中断在</font>**_**<font style="color:rgb(51, 51, 51);">kernel/trap.c</font>**_**<font style="color:rgb(51, 51, 51);">中的</font>**`**<font style="background-color:rgb(247, 247, 247);">usertrap()</font>**`**<font style="color:rgb(51, 51, 51);">中处理，下面是处理代码</font>**

```c
void usertrap(void)
{
    int which_dev = 0;
    if ((r_sstatus() & SSTATUS_SPP) != 0)
        panic("usertrap: not from user mode");
    // send interrupts and exceptions to kerneltrap(),
    // since we're now in the kernel.
    w_stvec((uint64)kernelvec);
    struct proc *p = myproc();
    // save user program counter.
    p->trapframe->epc = r_sepc();
    /** 判断是什么原因调用了usertrap函数*/ 
    // 是否是系统调用
    if (r_scause() == 8)
    {
        // system call
        if (p->killed)
            exit(-1);
        // sepc points to the ecall instruction,
        // but we want to return to the next instruction.
        p->trapframe->epc += 4;
        // an interrupt will change sstatus &c registers,
        // so don't enable until done with those registers.
        // 关闭中断
        intr_on();

        syscall();
    }
    // 是否是设备中断
    else if ((which_dev = devintr()) != 0)
    {
        // ok
    }
    // 处理意外的陷阱
    else
    {
        printf("usertrap(): unexpected scause %p pid=%d\n", r_scause(), p->pid);
        printf("            sepc=%p stval=%p\n", r_sepc(), r_stval());
        p->killed = 1;
    }
    if (p->killed)
        exit(-1);
    // give up the CPU if this is a timer interrupt.
    // 如果这是一个定时器中断，则放弃 CPU。
    if (which_dev == 2){
        
        #ifdef lab_traps
        if (p->alarm_ticks != 0 && p->alarm_status != 1)
        {
            p->total_ticks++;
            if (p->alarm_ticks == p->total_ticks)
            {
                p->total_ticks = 0;
                // void *handler() = (void *)p->handler;
                //void (*handler)(void) = (void (*)(void))p->handler;
                //handler();
                // 需要保存寄存器内容，我们要在执行完报警程序后回到原本的代码执行处
                memmove(p->alarm_trapframe, p->trapframe, sizeof(struct trapframe));
                // 正常情况下，中断恢复执行epc指向的代码，也就是恢复原本代码，但我们这个lab中
                // 通过更改epc来改变中断后执行的函数，最后再通过 sigreturn 进行恢复
                // 这就是为什么在上面我们保存了寄存器的内容
                p->trapframe->epc = p->handler;	
                p->alarm_status = 1;
            }
        }
        #endif

        yield();
    }
    usertrapret();
}
```

+ **<font style="color:rgb(51, 51, 51);">在跳转执行特定的处理函数后，我们需要返回到原本的代码值</font>**
+ **<font style="color:rgb(51, 51, 51);">这个特定的处理函数需要配合 </font>****sigreturn 一起使用，处理函数处理完后通过 sigreturn 来返回到原本的代码**

```c
void
periodic()
{
  count = count + 1;
  printf("alarm!\n");
  sigreturn();
}
```

+ **sys_sigreturn 和正常的中断恢复不同，是我们人为的恢复数据，和正常的中断恢复的流程不一样**

```c
uint64 
sys_sigreturn(void){
  myproc()->alarm_status = 0;
    // 恢复原本的数据，sepc也变为
  memmove(myproc()->trapframe, myproc()->alarm_trapframe, sizeof(struct trapframe));
  return 0;
 }
```


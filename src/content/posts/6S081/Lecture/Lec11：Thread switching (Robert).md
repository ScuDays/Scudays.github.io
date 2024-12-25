---
title: Lec11：Thread switching (Robert)
date: 2024-10-22 00:39:59
modify: 2024-12-22 16:41:08
author: days
category: 6S081
published: 2024-10-22
---
# Lec11：Thread switching (Robert)
## 总结：
### 上下文切换

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/a0130c8603bcdbd4e832c783c5186ac6.png)

**<font style="color:rgb(51, 51, 51);">图7.1概述了从一个用户进程（旧进程）切换到另一个用户进程（新进程）所涉及的步骤：</font>**

1. **<font style="color:rgb(51, 51, 51);">一个到旧进程内核线程的用户-内核转换（系统调用或中断），</font>**
2. **<font style="color:rgb(51, 51, 51);">一个到当前CPU调度程序线程的上下文切换，</font>**
3. **<font style="color:rgb(51, 51, 51);">一个到新进程内核线程的上下文切换，</font>**
4. **<font style="color:rgb(51, 51, 51);">以及一个返回到用户级进程的陷阱。调度程序在旧进程的内核栈上执行是不安全的：其他一些核心可能会唤醒进程并运行它，而在两个不同的核心上使用同一个栈将是一场灾难，因此xv6调度程序在每个CPU上都有一个专用线程（保存寄存器和栈）。</font>**

**从一个线程切换到另一个线程需要保存旧线程的CPU寄存器，并恢复新线程先前保存的寄存器；**

**栈指针和程序计数器被保存和恢复的事实意味着CPU将切换栈和执行中的代码。**

**函数****swtch****为内核线程切换执行保存和恢复操作。****swtch****对线程没有直接的了解；它只是保存和恢复寄存器集，称为上下文（contexts）。当某个进程要放弃CPU时，该进程的内核线程调用**`**swtch**`**来保存自己的上下文并返回到调度程序的上下文。**

**每个上下文都包含在一个****struct context****（****kernel/proc.h****:2）中，这个结构体本身包含在一个进程的****struct proc****或一个CPU的****struct cpu****中。**

**Swtch接受两个参数：struct context *old和struct context *new。它将当前寄存器保存在old中，从new中加载寄存器，然后返回。**

:::color3

这里不太容易理解，这里举个课程视频中的例子：

**以cc切换到ls为例，且ls此前运行过**

1. XV6将cc程序的内核线程的内核寄存器保存在一个context对象中
2. 因为要切换到ls程序的内核线程，那么ls 程序现在的状态必然是RUNABLE ，表明ls程序之前运行了一半。这同时也意味着：

a. ls程序的用户空间状态已经保存在了对应的trapframe中

b. ls程序的内核线程对应的内核寄存器已经保存在对应的context对象中

所以接下来，XV6会恢复ls程序的内核线程的context对象，也就是恢复内核线程的寄存器。

3. 之后ls会继续在它的内核线程栈上，完成它的中断处理程序
4. 恢复ls程序的trapframe中的用户进程状态，返回到用户空间的ls程序中
5. 最后恢复执行ls

:::

## 11.1 线程（Thread）概述 

讨论线程以及XV6如何实现线程切换。这节课与之前介绍的系统调用、中断、页表和锁的课程一样，都是关于XV6底层实现的内容。我们将探讨XV6如何在多个线程之间进行切换。  
计算机需要运行多线程的原因包括：

+ **提高并发性**：用户希望计算机能够同时执行多个任务，例如MIT的Athena系统允许多个用户同时登录并运行各自的进程。即使在单用户的设备上，也经常需要同时运行多个进程。
+ **简化程序结构**：多线程可以帮助程序员以更简单优雅的方式组织代码，降低复杂度。例如，在第一个实验中，通过使用多个进程可以更方便地处理素数问题。
+ **提升性能**：利用多核CPU，多线程可以实现并行计算，从而加快处理速度。如果能在四个CPU核心上分别运行四个线程，则理论上可以获得四倍的处理速度。XV6正是一个支持多CPU并行运算的系统。

**线程具有状态**，我们可以随时保存线程的状态并暂停线程的运行，并在之后通过恢复状态来恢复线程的运行。线程的状态包含了三个部分：

+ **程序计数器（Program Counter），它表示当前线程执行指令的位置。**
+ **保存变量的寄存器。**
+ **程序的Stack（注，详见5.5）。通常来说每个线程都有属于自己的Stack，Stack记录了函数调用的记录，并反映了当前线程的执行点。**

---

**操作系统中的线程系统负责管理多个线程的执行。当我们启动大量线程时，线程系统需要确保这些线程能够有效地运行。  
****多线程并行执行主要有两种方式，这节课我们主要研究第二种方式：**

1. **使用多核处理器上的多个CPU核心来同时运行不同的线程**。如果有4个CPU核心，则每个核心可以独立运行一个线程。然而，如果线程数量远超过CPU核心数（例如上千个线程），这种方法就不足以解决问题。
2. **采用单个CPU在多个线程间快速切换的方法**。即使只有一个CPU，它也可以通过保存当前线程状态后切换到另一个线程的方式，让成百上千个线程轮流得到执行机会。这种方式下，XV6操作系统会先运行某个线程一段时间，然后暂停该线程并将控制权转移给下一个线程，以此类推，直到所有线程都被调度执行过至少一次，然后再循环回第一个线程继续执行。

---

XV6操作系统结合了两种线程管理策略：首先，线程可以在所有可用的CPU核心上运行；其次，每个CPU核心会在多个线程间切换。通常，线程数量远超过CPU核心数。

+ **共享内存**：一些系统中，线程共享同一地址空间，允许直接访问彼此的数据。这种情况下需要使用锁来避免冲突。
+ **XV6中的线程模型**：
    - **内核线程**共享内核内存，处理来自用户进程的系统调用。
    - **用户线程**则各自拥有独立的地址空间，不共享内存。

相比之下，更复杂的系统如Linux支持在单个用户进程中创建多个线程，这些线程共享同一个地址空间，这使得实现多核上的并行操作成为可能，但同时也增加了复杂性。  
虽然存在其他技术（如事件驱动编程或状态机）可以用来在同一台计算机上执行多个任务而无需使用线程，但线程仍然是较为直观且广泛采用的方法，特别是对于需要同时处理大量不同任务的情况。

## 11.2 线程调度
**实现内核中的线程系统面临以下挑战：**

1. **线程切换**：需要在不同线程间进行调度，即停止当前线程并启动另一个。XV6为每个CPU核心创建了一个调度器来管理这一过程。
2. **状态保存与恢复**：在线程切换时，必须确定哪些信息是需要被保存的，并找到合适的存储位置，以便之后可以恢复线程的状态。
3. **处理运算密集型线程**：对于那些执行长时间计算任务而不主动释放CPU资源的线程，系统需要能够强制中断这些线程的执行，让其他线程有机会运行。



+ **下面将简要说明如何处理运算密集型线程。**

**方法是利用定时器中断**，这是一种常见的技术。

每个CPU核心都有一个定时触发中断的硬件设备。XV6操作系统会捕捉这些中断并传递给内核处理。

这意味着即使用户程序正在执行耗时的任务（如计算π的小数点后100万位），每隔固定时间（比如10毫秒）发生的定时器中断也会强制程序控制权从用户空间转到内核中的中断处理函数。

这种机制确保了即使用户程序试图长时间占用CPU资源，内核也能定期收回控制权。当中断处理程序在内核中运行时，它会让出CPU使用权给线程调度器，并指示可以切换到其他等待执行的线程上。这一过程涉及到保存当前线程的状态并在适当时候恢复，从而实现线程之间的平滑转换。

---

+ **抢占式调度（pre-emptive scheduling）**

**在之前的课程中，已经学过了中断处理的基本流程：定时器中断将CPU控制权交给内核，然后内核再主动出让CPU。这个过程意味着即使用户代码不主动让出CPU，定时器中断也会强制夺走控制权并交给线程调度器。**

+ **自愿调度（voluntary scheduling）**

**与抢占式调度相反，指用户代码主动让出CPU。**

---

+ **线程调度具体实现**

**在XV6等操作系统中，线程调度通过定时器中断实现：中断将CPU控制权从用户进程转移到内核，进行抢占式调度(pre-emptive scheduling)。然后，内核代表用户进程执行自愿调度(voluntary scheduling)。  
****操作系统需要区分三种类型的线程：**

1. **正在CPU上运行的线程。**
2. **准备好一旦有空闲CPU即可运行的线程。**
3. **不希望立即运行的线程，通常是因为它们正在等待I/O或其他事件。**

线程的状态帮助系统识别这些类别，但实际状态更加复杂（包括程序计数器、寄存器和栈等信息）。

主要的几种线程状态为：

+ **RUNNING**：线程当前在一个CPU上运行。
+ **RUNNABLE**：线程尚未运行，但准备就绪，等待可用的CPU。
+ **SLEEPING**：线程暂停，等待特定事件如I/O完成后再继续运行（本课不详细介绍）。  
这种简化有助于理解基本概念，而具体的实现细节则涉及更多技术层面的内容。

我们重点讨论了RUNNING和RUNABLE两种线程状态。定时器中断或抢占式调度（pre-emptive scheduling）的作用是将一个RUNNING线程转变为RUNABLE状态，即通过释放CPU使用权，让正在运行的线程变成可以随时再次运行的状态。

+ 对于处于RUNNING状态的线程，其程序计数器和寄存器值直接存储在当前执行它的CPU里。
+ 而对于转换为RUNABLE状态的线程，则需要将其在CPU中的这些信息保存到内存中特定位置，以便后续恢复使用。这里指的是从CPU寄存器直接复制数据到内存的过程。  
当调度器选择运行一个RUNABLE线程时，其中一个关键步骤就是将之前保存在内存中的程序计数器和寄存器值重新加载回对应的CPU上。

## 11.3 线程切换（一）

接下来，我将通过两张图来介绍XV6中线程切换的实现。

**首先，在XV6系统中，可以运行多个用户空间进程，如C编译器（CC）、LS和Shell等。每个进程都有独立的内存空间，特别是每个进程都有自己的用户程序栈。当一个进程运行时，它实际上是在执行该进程中的一个用户线程，并且该线程会在RISC-V处理器上拥有自己的程序计数器和寄存器。**

**如果用户线程执行了系统调用或因中断进入内核模式，则其当前状态（包括程序计数器和寄存器值）会被保存到trapframe结构中。**

1. **随后，CPU切换到内核栈继续执行，通常会进入到trampoline和usertrap处理逻辑。内核接着处理系统调用或中断。**
2. **处理完成后，若需返回用户空间，则从trapframe恢复之前保存的状态，使得用户线程能够继续执行。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPas2O4FxEvLUjjQpZq%252F-MPdWVfsadOjtlVS_WV3%252Fimage.png%3Falt%3Dmedia%26token%3D89fd35b7-d4a9-4bc5-91f6-388c20d5dc47&width=768&dpr=4&quality=100&sign=fd0babf3&sv=1)

**用户进程可能因CPU响应诸如定时器中断等事件而进入内核空间。**

**正如先前所述，抢占式调度机制通过定时器中断实现从一个用户进程到另一个用户进程的切换。**

:::success

+ **概念：当定时器中断处理过程中 XV6 内核决定执行上下文切换时**

:::

1. **首先会在内核层面将当前活动的第一个进程的内核线程状态转换为第二个目标进程的内核线程状态。**
2. **在完成这一内核级别的转换后，系统会使用先前保存在陷阱帧（trapframe）中的信息恢复第二个用户进程的状态，从而实现从内核模式回到用户模式的转变，并继续执行该用户进程。此过程确保了不同用户进程间平滑且高效的切换。**

:::success

+ **具体例子：当XV6从CC程序的内核线程切换到LS程序的内核线程时**

:::

1. **XV6会首先会将CC程序的内核线程的内核寄存器保存在一个context对象中。**
2. **因为要切换到LS程序的内核线程，那么LS程序现在的状态必然是RUNABLE，表明LS程序之前运行了一半。这也意味着LS程序的用户空间状态之前已经保存在了对应的trapframe中，更重要的是，LS程序的内核线程对应的内核寄存器也已经保存在对应的context对象中。**
3. **所以接下来，XV6会恢复LS程序的内核线程的context对象，也就是恢复内核线程的寄存器。**
4. **之后LS会继续在它的内核线程栈上，完成它的中断处理程序（注，假设之前LS程序也是通过定时器中断触发的pre-emptive scheduling进入的内核）。**
5. **然后通过恢复LS程序的trapframe中的用户进程状态，返回到用户空间的LS程序中。**
6. **最后恢复执行LS。**

:::success

+ **这里核心点在于，在XV6中，任何时候都需要经历：**

:::

1. **从一个用户进程切换到另一个用户进程，都需要从第一个用户进程接入到内核中，保存用户进程的状态并运行第一个用户进程的内核线程。**
2. **再从第一个用户进程的内核线程切换到第二个用户进程的内核线程。**
3. **之后，第二个用户进程的内核线程暂停自己，并恢复第二个用户进程的用户寄存器。**
4. **最后返回到第二个用户进程继续执行。**

**这么曲折的一个线路。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPas2O4FxEvLUjjQpZq%252F-MPdb6wxbjfn3h1q5Kyl%252Fimage.png%3Falt%3Dmedia%26token%3D93fdc313-49d2-49e7-9b3a-f4ea54028b79&width=768&dpr=4&quality=100&sign=2ab1f801&sv=1)

## 11.4 线程切换（二）
**实际的线程切换流程会复杂的多。**

**假设我们进程 P1 正在运行，进程 P2 是 **`**RUNABLE**`** 当前并不在运行。**

**假设在XV6中我们有2个CPU核--CPU0和CPU1。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPdcH_WBeBZJksnsmWf%252F-MPg-7FbYd7riEbBR_PH%252Fimage.png%3Falt%3Dmedia%26token%3D9e56bc98-db06-4d22-baa7-233d0d9a03a9&width=768&dpr=4&quality=100&sign=33ceca0d&sv=1)

## swtch()函数
**我们从一个正在运行的用户空间进程切换到另一个RUNABLE但还没有运行的用户空间进程的更完整的操作时：**

1. **首先一个定时器中断强迫CPU从用户空间进程切换到内核，trampoline代码将用户寄存器保存于用户进程对应的trapframe对象中；**
2. **之后在内核中运行usertrap，来实际执行相应的中断处理程序。这时，CPU正在进程 P1 的内核线程和内核栈上，执行内核中普通的C代码；**
3. **假设进程 P1 对应的内核线程决定让出 CPU，它会做很多工作，但是最后它会****<font style="background-color:#FBDE28;">调用swtch函数</font>****（译注：switch 是C 语言关键字，因此这个函数命名为swtch 来避免冲突），这是整个线程切换的核心函数之一；**
4. **swtch 函数会保存用户进程P1对应内核线程的寄存器至 context 对象。所以目前为止有两类寄存器：用户寄存器存在 trapframe 中，内核线程的寄存器存在 context 中。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPg0UEY8_oK6jPwEU3p%252F-MPilhv-4DUgPG371y1c%252Fimage.png%3Falt%3Dmedia%26token%3D4eb2bd8a-18ac-4826-ac57-34f2a256a403&width=768&dpr=4&quality=100&sign=17f45c0f&sv=1)

### 调度器线程
**但是，实际上swtch函数并不是直接从一个内核线程切换到另一个内核线程。**

---

**<font style="background-color:#FBDE28;">XV6中，一个CPU上运行的内核线程可以直接切换到的是这个 CPU 对应的调度器线程。</font>**

**所以如果我们现在运行在 CPU0，swtch 函数会恢复成之前 CPU0 的调度器线程保存的寄存器和stack pointer，之后在调度器线程的 context 下执行 schedulder 函数中（注，后面代码分析有介绍）。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPg0UEY8_oK6jPwEU3p%252F-MPilsY6BV0H692gJabX%252Fimage.png%3Falt%3Dmedia%26token%3Da70eb81f-ee2a-4532-98ed-18658bdaaa84&width=768&dpr=4&quality=100&sign=6441633c&sv=1)

**在调度器线程执行的 schedulder 函数中会做一些清理工作**

**例如将进程 P1 设置成 RUNABLE 状态。之后再通过进程表单找到下一个RUNABLE进程。**

**假设找到的下一个进程是P2（虽然也有可能找到的还是P1），schedulder函数会再次调用swtch函数，完成下面步骤：**

1. **先保存自己的寄存器到调度器线程的 context 对象**
2. **找到进程 P2 之前保存的 context，恢复其中的寄存器**
3. **因为进程 P2 在进入 RUNABLE 状态之前，如刚刚介绍的进程 P1 一样，必然也调用了 swtch 函数。所以之前的 swtch 函数会被恢复，并返回到进程 P2 所在的系统调用或者中断处理程序中（注，因为 P2 进程之前调用 swtch 函数必然在系统调用或者中断处理程序中）。**
4. **不论是系统调用也好中断处理程序也好，在从用户空间进入到内核空间时会保存用户寄存器到 trapframe 对象。所以当内核程序执行完成之后， trapframe 中的用户寄存器会被恢复。**
5. **最后用户进程P2就恢复运行了。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPg0UEY8_oK6jPwEU3p%252F-MPioYHlKAiAlXZ3HiBR%252Fimage.png%3Falt%3Dmedia%26token%3D6124dd5c-0e08-43f7-9ef1-714e79aa9654&width=768&dpr=4&quality=100&sign=dc2f94b9&sv=1)

**每一个CPU都有一个完全不同的调度器线程。调度器线程也是一种内核线程，它也有自己的context对象。**

**任何运行在CPU1上的进程，当它决定出让CPU，它都会切换到CPU1对应的调度器线程，并由调度器线程切换到下一个进程。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPg0UEY8_oK6jPwEU3p%252F-MPipIWU2WKegXEwqJn9%252Fimage.png%3Falt%3Dmedia%26token%3Dbe681ec4-2808-4cfa-a96f-6cba66d4c260&width=768&dpr=4&quality=100&sign=a0b81a69&sv=1)

> **学生提问：context保存在哪？**
>
> **Robert教授：每一个内核线程都有一个context对象。但是内核线程实际上有两类。每一个用户进程有一个对应的内核线程，它的context对象保存在用户进程对应的proc结构体中。**
>
> **每一个调度器线程，它也有自己的context对象，但是它却没有对应的进程和proc结构体，所以调度器线程的context对象保存在cpu结构体中。在内核中，有一个cpu结构体的数组，每个cpu结构体对应一个CPU核，每个结构体中都有一个context字段。**
>
> ****
>
> **学生提问：为什么不能将context对象保存在进程对应的trapframe中？**
>
> **Robert教授：context可以保存在trapframe中，因为每一个进程都只有一个内核线程对应的一组寄存器，我们可以将这些寄存器保存在任何一个与进程一一对应的数据结构中。对于每个进程来说，有一个proc结构体，有一个trapframe结构体，所以我们可以将context保存于trapframe中。但是或许出于简化代码或者让代码更清晰的目的，trapframe还是只包含进入和离开内核时的数据。而context结构体中包含的是在内核线程和调度器线程之间切换时，需要保存和恢复的数据。**
>
> ****
>
> **学生提问：出让CPU是由用户发起的还是由内核发起的？**
>
> **Robert教授：对于XV6来说，并不会直接让用户线程出让CPU或者完成线程切换，而是由内核在合适的时间点做决定。有的时候你可以猜到特定的系统调用会导致出让CPU，例如一个用户进程读取pipe，而它知道pipe中并不能读到任何数据，这时你可以预测读取会被阻塞，而内核在等待数据的过程中会运行其他的进程。**
>
> **内核会在两个场景下出让CPU。当定时器中断触发了，内核总是会让当前进程出让CPU，因为我们需要在定时器中断间隔的时间点上交织执行所有想要运行的进程。另一种场景就是任何时候一个进程调用了系统调用并等待I/O，例如等待你敲入下一个按键，在你还没有按下按键时，等待I/O的机制会触发出让CPU。**
>
> ****
>
> **学生提问：用户进程调用sleep函数是不是会调用某个系统调用，然后将用户进程的信息保存在trapframe，然后触发进程切换，这时就不是定时器中断决定，而是用户进程自己决定了吧？**
>
> **Robert教授：如果进程执行了read系统调用，然后进入到了内核中。而read系统调用要求进程等待磁盘，这时系统调用代码会调用sleep，而sleep最后会调用swtch函数。swtch函数会保存内核线程的寄存器到进程的context中，然后切换到对应CPU的调度器线程，再让其他的线程运行。这样在当前线程等待磁盘读取结束时，其他线程还能运行。所以，这里的流程除了没有定时器中断，其他都一样，只是这里是因为一个系统调用需要等待I/O（注，感觉答非所问）**
>
> ****
>
> **学生提问：每一个CPU的调度器线程有自己的栈吗？**
>
> **Robert教授：是的，每一个调度器线程都有自己独立的栈。实际上调度器线程的所有内容，包括栈和context，与用户进程不一样，都是在系统启动时就设置好了。如果你查看XV6的start.s（注：是entry.S和start.c）文件，你就可以看到为每个CPU核设置好调度器线程。**
>

**当人们在说 context switching(上下文切换)，他们通常说的是从一个线程切换到另一个线程，因为在切换的过程中需要先保存前一个线程的寄存器，然后再恢复之前保存的后一个线程的寄存器，**

**这些寄存器都是保存在context对象中。在有些时候，context switching也指从一个用户进程切换到另一个用户进程的完整过程。偶尔你也会看到context switching是指从用户空间和内核空间之间的切换。对于我们这节课来说，context switching主要是指一个内核线程和调度器线程之间的切换。**

**每个CPU核心在同一时间只能执行一个线程，这可以是用户进程、内核线程或调度器线程之一。因此，在任何时刻，一个CPU核心只处理一项任务。通过快速切换线程，给人们造成了多个线程同时在单个CPU上运行的错觉。每个线程要么在一个CPU核心上运行，要么其状态被保存下来暂停执行；线程不会跨多个CPU核心并行运行。**

**在XV6的代码中，context对象总是由swtch函数产生，所以context总是保存了内核线程在执行swtch函数时的状态。当我们在恢复一个内核线程时，对于刚恢复的线程所做的第一件事情就是从之前的swtch函数中返回（注，有点抽象，后面有代码分析）。**

> **学生提问：我们这里一直在说线程，但是从我看来XV6的实现中，一个进程就只有一个线程，有没有可能一个进程有多个线程？**
>
> **Robert教授：我们这里的用词的确有点让人混淆。在XV6中，一个进程要么在用户空间执行指令，要么是在内核空间执行指令，要么它的状态被保存在context和trapframe中，并且没有执行任何指令。这里该怎么称呼它呢？你可以根据自己的喜好来称呼它，对于我来说，每个进程有两个线程，一个用户空间线程，一个内核空间线程，并且存在限制使得一个进程要么运行在用户空间线程，要么为了执行系统调用或者响应中断而运行在内核空间线程 ，但是永远也不会两者同时运行。**
>

## 11.5 进程切换示例程序
### proc结构体

接下来，我们切换到代码。我们先来看一下proc.h中的proc结构体，从结构体中我们可以看到很多之前介绍的内容。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPlA8TdJmidn6m4MngD%252F-MPnrlXVjhqSv55SaNaq%252Fimage.png%3Falt%3Dmedia%26token%3D11b1bceb-efc7-4bdb-8ef1-511e44f8b149&width=768&dpr=4&quality=100&sign=ecdae2f9&sv=1)

+ 首先是保存了用户空间线程寄存器的**trapframe**字段
+ 其次是保存了内核线程寄存器的 **context** 字段
+ 还有保存了当前进程的内核栈的**kstack**字段，这是进程在内核中执行时保存函数调用的位置
+ **state**字段保存了当前进程状态，要么是**RUNNING**，要么是**RUNABLE**，要么是**SLEEPING**等等
+ **lock**字段保护了很多数据，目前来说至少保护了对于**state**字段的更新。举个例子，因为有锁的保护，两个CPU的调度器线程不会同时拉取同一个RUNABLE进程并运行它

### 演示程序

我接下来会运行一个简单的演示程序，在这个程序中我们会从一个进程切换到另一个。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPlA8TdJmidn6m4MngD%252F-MPntE1YFDaXfM--9WoX%252Fimage.png%3Falt%3Dmedia%26token%3Dd67e55ae-f178-406a-8764-e59d4aac0070&width=768&dpr=4&quality=100&sign=7075160a&sv=1)

这个程序创建了两个持续运行的进程。首先通过fork创建一个子进程，然后两个进程各自进入死循环，每隔100万个循环打印一次输出以表明仍在运行（注，每隔1000000次循环才打印一个输出）。由于没有使用sleep，这两个进程都是运算密集型的，并且将在同一个CPU核心上运行（因为我们使用的XV6系统只有一个CPU核）。为了使两个进程都能得到执行机会，需要实现进程间的切换。

接下来让我运行spin程序，

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPlA8TdJmidn6m4MngD%252F-MPnuy4mDWPxvIeasDPU%252Fimage.png%3Falt%3Dmedia%26token%3D9ac397ce-0428-4f8d-b746-14679d05e509&width=768&dpr=4&quality=100&sign=bb3e1d20&sv=1)

你可以看到一直有字符在输出，

一个进程在输出“/”，另一个进程在输出"\"。

从输出看，虽然现在XV6只有一个CPU核，但是每隔一会，XV6就在两个进程之间切换。“/”输出了一会之后，定时器中断将CPU切换到另一个进程运行然后又输出“\”一会。

**所以在这里我们可以看到定时器中断在起作用。**

接下来，我在trap.c的devintr函数中的207行设置一个断点，这一行会识别出当前是在响应定时器中断。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPlA8TdJmidn6m4MngD%252F-MPnwT_qm9C9EWyrFMgf%252Fimage.png%3Falt%3Dmedia%26token%3D367125c4-df7d-406b-a9a1-be34b373d806&width=768&dpr=4&quality=100&sign=e685ad98&sv=1)

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPlA8TdJmidn6m4MngD%252F-MPnwZklQHgMWjNz0MeF%252Fimage.png%3Falt%3Dmedia%26token%3Db0bbedd0-d3bc-4321-98ad-263b2e51ea79&width=768&dpr=4&quality=100&sign=7d2bdc64&sv=1)

之后在gdb中continue。立刻会停在中断的位置，因为定时器中断还是挺频繁的。

现在我们可以确认我们在usertrap函数中，并且usertrap函数通过调用devintr函数来处理这里的中断（注，从下图的栈输出可以看出）。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPnwhbNBmp_ySz6aCiz%252F-MPnxRkMhZ3GMdh9ezXe%252Fimage.png%3Falt%3Dmedia%26token%3Dedb86bb2-bb83-444b-bd47-abf9ae9bef11&width=768&dpr=4&quality=100&sign=b91c0e20&sv=1)

因为devintr函数处理定时器中断的代码基本没有内容，接下来在gdb中输入finish来从devintr函数返回到 usertrap。

当我们返回到usertrap函数时，虽然我们刚刚从devintr函数中返回，但是我们期望运行到下面的yield函数。所以我们期望devintr函数返回2。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPnwhbNBmp_ySz6aCiz%252F-MPny5AZb3vpx0EjzWo8%252Fimage.png%3Falt%3Dmedia%26token%3D844e4b80-f2a0-4e31-95ab-4e808a3dd96e&width=768&dpr=4&quality=100&sign=41f5f90d&sv=1)

可以从gdb中看到devintr的确返回的是2。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPnwhbNBmp_ySz6aCiz%252F-MPnySLE4WVY4O5qAGNM%252Fimage.png%3Falt%3Dmedia%26token%3Daf4920b0-9138-4126-ac22-344f2e920beb&width=768&dpr=4&quality=100&sign=ecc08894&sv=1)

在yield函数中，当前进程会出让CPU并让另一个进程运行。这个我们稍后再看。现在让我们看一下当定时器中断发生的时候，用户空间进程正在执行什么内容。我在gdb中输入print p来打印名称为p的变量。变量p包含了当前进程的proc结构体。

> 学生提问：怎么区分不同进程的内核线程？
>
> Robert教授：每一个进程都有一个独立的内核线程。实际上有两件事情可以区分不同进程的内核线程，其中一件是，每个进程都有不同的内核栈，它由proc结构体中的kstack字段所指向；另一件就是，任何内核代码都可以通过调用myproc函数来获取当前CPU正在运行的进程。内核线程可以通过调用这个函数知道自己属于哪个用户进程。myproc函数会使用tp寄存器来获取当前的CPU核的ID，并使用这个ID在一个保存了所有CPU上运行的进程的结构体数组中，找到对应的proc结构体。这就是不同的内核线程区分自己的方法。
>

我首先会打印p->name来获取进程的名称，

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPnwhbNBmp_ySz6aCiz%252F-MPo1hHVuiWYh0wChpkM%252Fimage.png%3Falt%3Dmedia%26token%3Da17f5b64-5ba0-4269-ab29-326ad82cee2b&width=768&dpr=4&quality=100&sign=f57756eb&sv=1)

当前进程是spin程序，如预期一样。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPnwhbNBmp_ySz6aCiz%252F-MPo1v8oxxLY4gMzOd_d%252Fimage.png%3Falt%3Dmedia%26token%3Da6351c1c-e937-4dc4-b97f-b384995b5714&width=768&dpr=4&quality=100&sign=e9d3a6b6&sv=1)

当前的进程ID是3，进程切换之后，我们预期进程ID会不一样。

我们还可以通过打印变量p的trapframe字段获取表示用户空间状态的32个寄存器，这些都是我们在Lec06中学过的内容。这里面最有意思的可能是trapframe中保存的用户程序计数器。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPnwhbNBmp_ySz6aCiz%252F-MPo2jbQamsdEBV-Bkkz%252Fimage.png%3Falt%3Dmedia%26token%3D5263244f-fa00-4751-a04a-5c4feb5af987&width=768&dpr=4&quality=100&sign=42579443&sv=1)

我们可以查看spin.asm文件来确定对应地址的指令。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPnwhbNBmp_ySz6aCiz%252F-MPo2ysO4rjmXvb02jja%252Fimage.png%3Falt%3Dmedia%26token%3Ddf9df6f6-dc43-42d1-8f29-e3ff32c6c708&width=768&dpr=4&quality=100&sign=a5040b1e&sv=1)

可以看到定时器中断触发时，用户进程正在执行死循环的加1，这符合我们的预期。

（注，以下问答来自课程结束部分，因为相关就移过来了）

> 学生提问：看起来所有的CPU核要能完成线程切换都需要有一个定时器中断，那如果硬件定时器出现故障了怎么办？
>
> Robert教授：是的，总是需要有一个定时器中断。用户进程的pre-emptive scheduling能工作的原因是，用户进程运行时，中断总是打开的。XV6会确保返回到用户空间时，中断是打开的。这意味着当代码在用户空间执行时，定时器中断总是能发生。在内核中会更加复杂点，因为内核中偶尔会关闭中断，比如当获取锁的时候，中断会被关闭，只有当锁被释放之后中断才会重新打开，所以如果内核中有一些bug导致内核关闭中断之后再也没有打开中断，同时内核中的代码永远也不会释放CPU，那么定时器中断不会发生。但是因为XV6是我们写的，所以它总是会重新打开中断。XV6中的代码如果关闭了中断，它要么过会会重新打开中断，然后内核中定时器中断可以发生并且我们可以从这个内核线程切换走，要么代码会返回到用户空间。我们相信XV6中不会有关闭中断然后还死循环的代码。
>
> 同一个学生提问：我的问题是，定时器中断是来自于某个硬件，如果硬件出现故障了呢？
>
> Robert教授：那你的电脑坏了，你要买个新电脑了。这个问题是可能发生的，因为电脑中有上亿的晶体管，有的时候电脑会有问题，但是这超出了内核的管理范围了。所以我们假设计算机可以正常工作。
>
> 有的时候软件会尝试弥补硬件的错误，比如通过网络传输packet，总是会带上checksum，这样如果某个网络设备故障导致某个bit反转了，可以通过checksum发现这个问题。但是对于计算机内部的问题，人们倾向于不用软件来尝试弥补硬件的错误。
>

> 学生提问：当一个线程结束执行了，比如说在用户空间通过exit系统调用结束线程，同时也会关闭进程的内核线程。那么线程结束之后和下一个定时器中断之间这段时间，CPU仍然会被这个线程占有吗？还是说我们在结束线程的时候会启动一个新的线程？
>
> Robert教授：exit系统调用会出让CPU。尽管我们这节课主要是基于定时器中断来讨论，但是实际上XV6切换线程的绝大部分场景都不是因为定时器中断，比如说一些系统调用在等待一些事件并决定让出CPU。exit系统调用会做各种操作然后调用yield函数来出让CPU，这里的出让并不依赖定时器中断。
>

## 11.6 线程切换 --- yield/sched函数

回到devintr函数返回到usertrap函数的地方。在gdb里多输入几次“step”命令，直到你进入yield函数的调用。yield函数是线程切换的第一步，下面是它的具体内容：

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPo3XwIXuht-vwuwogZ%252F-MPqDSuDUAjxhmKs3bRj%252Fimage.png%3Falt%3Dmedia%26token%3Da35fcd6d-48db-4d1f-9990-b18150ecada7&width=768&dpr=4&quality=100&sign=d4fb02b3&sv=1)

`yield`函数主要执行了以下几个关键步骤。

1. **首先，它会获取当前进程的锁。这一操作至关重要，因为在释放该锁之前，进程状态可能会出现不一致性。**
2. **具体来说，当yield将进程状态更改为RUNNABLE时，这实际上表示该进程已准备好但尚未运行。然而，在这个过程中，进程代码仍在其内核线程中执行。**
3. **因此，加锁的一个重要目的就是确保即使进程状态被标记为RUNNABLE，其他CPU核心上的调度器也不会立即看到这一状态并尝试调度此进程，从而避免同一进程在多个CPU上并发执行的问题。由于XV6操作系统中的每个用户进程仅有一个用户线程且共享单一栈空间，这样的并发执行会导致严重错误。**
4. **随后，yield函数正式更改当前进程的状态为RUNNABLE。这意味着当前进程主动放弃CPU资源，并准备交由调度器管理以待后续重新调度。这种状态转换通常发生在定时器中断触发后，导致正在运行的进程暂时让出处理器控制权的情况下。**

最后，**yield调用了位于proc.c文件中的sched函数来完成实际的上下文切换工作**。**通过进入sched函数**，**可以进一步观察到具体的调度逻辑实现细节。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPo3XwIXuht-vwuwogZ%252F-MPqG5J_0Kd38sS3FXWM%252Fimage.png%3Falt%3Dmedia%26token%3Deab1e070-55e5-49d6-b66f-99c4b7f5c14a&width=768&dpr=4&quality=100&sign=d06de555&sv=1)

可以观察到，sched 函数主要执行了一系列的合理性检查，并在检测到异常时触发 panic。

**存在大量的检查，是因为 XV6 代码历经多年的发展，在此过程中遭遇了多种类型的错误。因此，为了防止潜在的问题，该函数中加入了诸多的合理性验证和相应的 panic 处理。**

**接下来，我将略过这些检查步骤，直接进入位于函数末尾的 swtch 调用部分。**

## 11.7 线程切换 --- switch函数

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252Fsync%252Ff4cc050e3bff8a56c3209994b0c48950af53fc4d.png%3Fgeneration%3D1617597330870174%26alt%3Dmedia&width=768&dpr=4&quality=100&sign=60a514b9&sv=1)

:::success

1. **swtch函数会将当前的内核线程的寄存器保存到p->context中。swtch函数的另一个参数c->context，c表示当前CPU的结构体。**
2. **CPU结构体中的context保存了当前CPU核的调度器线程的寄存器。所以swtch函数在保存完当前内核线程的内核寄存器之后，就会恢复当前CPU核的调度器线程的寄存器，并继续执行当前CPU核的调度器线程。**

:::

接下来，我们快速的看一下我们将要切换到的context（注，也就是调度器线程的context）。因为我们只有一个CPU核，这里我在gdb中print cpus[0].context

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MPo3XwIXuht-vwuwogZ%252F-MPqIWBTJ2ql5nxuiTaL%252Fimage.png%3Falt%3Dmedia%26token%3Dc0cdd64c-2a7a-41db-be64-4f8401711b3f&width=768&dpr=4&quality=100&sign=544e4445&sv=1)

**这里看到的就是之前保存的当前CPU核的调度器线程的寄存器。在这些寄存器中，最有趣的就是ra（Return Address）寄存器，因为ra寄存器保存的是当前函数的返回地址，所以调度器线程中的代码会返回到ra寄存器中的地址。通过查看kernel.asm，我们可以知道这个地址的内容是什么。也可以在gdb中输入“x/i 0x80001f2e”进行查看。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MQ7GitB92kXBjpg1D92%252F-MQCSM6sCSkUNgyvQfrw%252Fimage.png%3Falt%3Dmedia%26token%3D016dd81d-b057-4cd7-bdf9-7ba59b8d7084&width=768&dpr=4&quality=100&sign=a96bfd6d&sv=1)

**输出中包含了地址中的指令和指令所在的函数名。所以我们将要返回到scheduler函数中。**

因为我们接下来要调用swtch函数，让我们来看看swtch函数的内容。swtch函数位于switch.s文件中。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MQ7GitB92kXBjpg1D92%252F-MQCU79U5w93hrTNHvHc%252Fimage.png%3Falt%3Dmedia%26token%3D16825013-b3dd-43f5-8e8d-5e3c0d93d6fa&width=768&dpr=4&quality=100&sign=6c6f7400&sv=1)

首先，ra寄存器被保存在了a0寄存器指向的地址。a0寄存器对应了swtch函数的第一个参数，从前面可以看出这是当前线程的context对象地址 ；a1寄存器对应了swtch函数的第二个参数，从前面可以看出这是即将要切换到的调度器线程的context对象地址。

所以函数中上半部分是将当前的寄存器保存在当前线程对应的context对象中，函数的下半部分是将调度器线程的寄存器，也就是我们将要切换到的线程的寄存器恢复到CPU的寄存器中。之后函数就返回了。**所以调度器线程的ra寄存器的内容才显得有趣，****<font style="background-color:#FBDE28;">因为它指向的是swtch函数返回的地址，也就是scheduler函数。</font>**

这里有个有趣的问题，或许你们已经注意到了。swtch函数的上半部分保存了ra，sp等等寄存器，但是并没有保存程序计数器pc（Program Counter），为什么会这样呢？

> 学生回答：因为程序计数器不管怎样都会随着函数调用更新。
>

是的，程序计数器并没有有效信息，我们现在知道我们在swtch函数中执行，所以保存程序计数器并没有意义。但是我们关心的是我们是从哪调用进到swtch函数的，因为当我们通过switch恢复执行当前线程并且从swtch函数返回时，我们希望能够从调用点继续执行。ra寄存器保存了swtch函数的调用点，所以这里保存的是ra寄存器。我们可以打印ra寄存器，如你们所预期的一样，它指向了sched函数。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MQ7GitB92kXBjpg1D92%252F-MQCYWEhUvMS21CjoydI%252Fimage.png%3Falt%3Dmedia%26token%3Dcd9b09c0-dce1-45d9-9c49-954cf2e0e668&width=768&dpr=4&quality=100&sign=38c21304&sv=1)

**另一个问题是，为什么RISC-V中有32个寄存器，但是swtch函数中只保存并恢复了14个寄存器？**

> 学生回答：因为switch是按照一个普通函数来调用的，对于有些寄存器，swtch函数的调用者默认swtch函数会做修改，所以调用者已经在自己的栈上保存了这些寄存器，当函数返回时，这些寄存器会自动恢复。所以swtch函数里只需要保存Callee Saved Register就行。（注，详见5.4）
>

**完全正确！因为swtch函数是从C代码调用的，所以我们知道Caller Saved Register会被C编译器保存在当前的栈上。Caller Saved Register大概有15-18个，而我们在swtch函数中只需要处理C编译器不会保存，但是对于swtch函数又有用的一些寄存器。所以在切换线程的时候，我们只需要保存Callee Saved Register。**

最后我想看的是sp（Stack Pointer）寄存器。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MQCads5sqicFNa18TGX%252F-MQF4iIrgYIVeAiU0KuD%252Fimage.png%3Falt%3Dmedia%26token%3D56a5d752-41df-4810-9cea-f287416aa0e5&width=768&dpr=4&quality=100&sign=e51de32e&sv=1)

从它的值很难看出它的意义是什么。它实际是当前进程的内核栈地址，它由虚拟内存系统映射在了一个高地址。

现在，我们保存了当前的寄存器，并从调度器线程的context对象恢复了寄存器，我直接跳到swtch函数的最后，也就是ret指令的位置。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MQCads5sqicFNa18TGX%252F-MQF5SKdm6KJ13a_MMzq%252Fimage.png%3Falt%3Dmedia%26token%3D960d16d6-6010-4904-9608-c90351062ce9&width=768&dpr=4&quality=100&sign=d73be989&sv=1)

在我们实际返回之前，我们再来打印一些有趣的寄存器。首先sp寄存器有了一个不同的值，

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MQCads5sqicFNa18TGX%252F-MQF66kVCfsVrXAub-RI%252Fimage.png%3Falt%3Dmedia%26token%3D91f4b698-4516-4f55-84c4-e9554db05c7d&width=768&dpr=4&quality=100&sign=1158780e&sv=1)

sp寄存器的值现在在内存中的stack0区域中。这个区域实际上是在启动顺序中非常非常早的一个位置，start.s在这个区域创建了栈，这样才可以调用第一个C函数。所以调度器线程运行在CPU对应的bootstack上。

其次是ra寄存器，

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MQCads5sqicFNa18TGX%252F-MQF7GyKoKQ35FuDhXvv%252Fimage.png%3Falt%3Dmedia%26token%3Da322fa5f-24ad-449d-906c-2e9dff0c798d&width=768&dpr=4&quality=100&sign=50713955&sv=1)

**现在指向了scheduler函数，因为我们恢复了调度器线程的context对象中的内容。**

**现在，我们其实已经在调度器线程中了，这里寄存器的值与上次打印的已经完全不一样了。虽然我们还在swtch函数中，但是现在我们实际上位于调度器线程调用的swtch函数中。调度器线程在启动过程中调用的也是swtch函数。接下来通过执行ret指令，我们就可以返回到调度器线程中。**

（注，以下提问来自于课程结束部分，因为相关所以移到这里）

> 学生提问：我不知道我们使用的RISC-V处理器是不是有一些其他的状态？但是我知道一些Intel的X86芯片有floating point unit state等其他的状态，我们需要处理这些状态吗？
>
> Robert教授：你的观点非常对。在一些其他处理器例如X86中，线程切换的细节略有不同，因为不同的处理器有不同的状态。所以我们这里介绍的代码非常依赖RISC-V。其他处理器的线程切换流程可能看起来会非常的不一样，比如说可能要保存floating point寄存器。我不知道RISC-V如何处理浮点数，但是XV6内核并没有使用浮点数，所以不必担心。但是是的，线程切换与处理器非常相关。
>
> **学生提问：为什么swtch函数要用汇编来实现，而不是C语言？**
>
> **Robert教授：C语言中很难与寄存器交互。可以肯定的是C语言中没有方法能更改sp、ra寄存器。所以在普通的C语言中很难完成寄存器的存储和加载，唯一的方法就是在C中嵌套汇编语言。所以我们也可以在C函数中内嵌switch中的指令，但是这跟我们直接定义一个汇编函数是一样的。或者说swtch函数中的操作是在C语言的层级之下，所以并不能使用C语言。**
>

## 11.8 XV6线程切换 --- scheduler函数
**来看一下scheduler的完整代码**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MQF83mxAUN2487Ywmqy%252F-MQ_zAO-C8xLZin1Edy_%252Fimage.png%3Falt%3Dmedia%26token%3D08a742fb-8fe3-4ded-a120-5b7607cb3d5e&width=768&dpr=4&quality=100&sign=8f028fd3&sv=1)

**现在我们正运行在CPU拥有的调度器线程中，并且我们正好在之前调用swtch函数的返回状态。之前调度器线程调用switch是因为想要运行pid为3的进程，也就是刚刚被中断的spin程序。**

**虽然pid为3的spin进程也调用了swtch函数，但是那个switch并不是当前返回的这个switch。spin进程调用的swtch函数还没有返回，而是保存在了pid为3的栈和context对象中。现在返回的是之前调度器线程对于swtch函数的调用。**

---

1. **先前在scheduler函数中，由于我们已经停止了spin进程的运行，所以我们需要抹去对spin进程的记录。因为我们现在并没有在这个CPU核上运行这个进程，所以我们接下来将c->proc设为 0。意为改 CPU 核运行的进程对象为0(代表该 CPU 上没有进程在运行)。**
2. **先前在yield函数中我们获取了进程的锁，这是因为yield不想进程在完全进入到Sleep状态之前，其他的CPU核的调度器线程能看到这个进程并运行它**。**而现在我们完成了从spin进程切换走，所以现在可以释放锁了。这就是release(&p->lock)的意义。**
3. **现在，我们仍然在scheduler函数中，但其他的CPU核可以发现spin进程并运行他，因为spin进程是RUNABLE状态，这没有问题，因为我们已经完整的保存了spin进程的寄存器，并且现在我们不在spin进程的栈上运行程序，而是在当前CPU核的调度器线程栈上运行其他程序。**

---

**接下来我将简单介绍一下p->lock。从调度的角度来说，这里的锁完成了两件事情。**

---

**出让CPU涉及到很多步骤，**

**首先：我们需要将进程的状态从RUNNING改成RUNABLE，将进程的寄存器保存在context对象中，并且还需要停止使用当前进程的栈。**

**所以这里至少有三个步骤，而这三个步骤需要花费一些时间。所以锁的第一个工作就是在这三个步骤完成之前，阻止任何一个其他核的调度器线程看到当前进程。锁这里确保了三个步骤的原子性。从CPU核的角度来说，三个步骤要么全发生，要么全不发生。**

**第二： 在启动进程时，p->lock 用于确保操作的原子性。我们需要将进程状态设为RUNNING，并将其上下文移到RISC-V寄存器中。若在此过程中发生中断，会导致进程处于异常状态（如状态为RUNNING但寄存器未完全更新）。因此，启动进程时需要加锁并关闭中断，以防止其他CPU核心访问该进程及定时器中断干扰切换过程。这就是为什么代码第468行需要加锁的原因。**

---

现在我们在**scheduler****<font style="background-color:#FBDE28;">函数的循环中</font>**，**代码会检查所有的进程并找到一个RUNABLE进程来运行**。

我们知道还存在另一个进程，因为我们之前**fork**了另一个**spin**进程。这里我跳过进程检查，直接在找到**RUNABLE**进程的位置设置一个断点。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MQF83mxAUN2487Ywmqy%252F-MQaD4H99wRtzjMTjsFN%252Fimage.png%3Falt%3Dmedia%26token%3Dced39a0e-a4cc-4045-ad32-09109ffc965d&width=768&dpr=4&quality=100&sign=9c6f94d&sv=1)

代码的468 行： 获取了进程的锁，所以现在我们可以进行切换到进程的各种步骤。

代码的473 行：进程的状态被设置成了RUNNING。

代码的474行：将找到的RUNABLE进程记录为当前CPU执行的进程。

代码的475行：又调用了swtch函数来保存调度器线程的寄存器，并恢复目标进程的寄存器（注，实际上恢复的是目标进程的内核线程）

我们可以打印新的进程的名字来查看新的进程。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MQF83mxAUN2487Ywmqy%252F-MQaGz5TlPPlAYv_pVhU%252Fimage.png%3Falt%3Dmedia%26token%3D04f0fc02-dbe0-4065-8766-9f889e7008b6&width=768&dpr=4&quality=100&sign=a63d57fa&sv=1)

**可以看到进程名还是spin，但是pid已经变成了4，而前一个进程的pid是3。我们还可以查看目标进程的context对象，**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MQF83mxAUN2487Ywmqy%252F-MQaHkXcutIc2vnhu6cD%252Fimage.png%3Falt%3Dmedia%26token%3D36789366-1c93-42c4-99a7-0407430b245a&width=768&dpr=4&quality=100&sign=cc52b226&sv=1)

**其中**`**ra**`**寄存器的内容就是我们要切换到的目标线程的代码位置。**

**虽然我们在代码475行调用的是swtch函数，但是我们前面已经看过了swtch函数最终返回到即将恢复的ra寄存器地址。**

**所以我们真正关心的就是ra指向的地址。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MQF83mxAUN2487Ywmqy%252F-MQaIIDPK_JBGHqH-OAO%252Fimage.png%3Falt%3Dmedia%26token%3D48a3b1a7-5647-453a-a0d3-712f0c6c1b3e&width=768&dpr=4&quality=100&sign=81278419&sv=1)

**通过打印这个地址的内容，可以看到swtch函数会返回到sched函数中。这完全在意料之中。**

**因为可以预期的是，将要切换到的进程之前是被定时器中断通过sched函数挂起的，并且之前在sched函数中又调用了swtch函数。**

**在swtch函数的最开始，我们仍然在调度器线程中，但是这一次是从调度器线程切换到目标进程的内核线程。所以从swtch函数内部将会返回到目标进程的内核线程的sched函数。**

**通过打印backtrace**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MQF83mxAUN2487Ywmqy%252F-MQaJhElyPGnfOSjnR9B%252Fimage.png%3Falt%3Dmedia%26token%3Ddd7c1f2b-1df3-4d61-af63-615b69738589&width=768&dpr=4&quality=100&sign=ed4a8fa7&sv=1)

**我们可以看到，之前有一个usertrap的调用，这必然是之前因为定时器中断而出现的调用。之后在中断处理函数中还调用了yield和sched函数，正如我们之前看到的一样。但这里调用yield和sched函数是pid为4的进程调用的，而不是刚刚的pid为3的进程。**

> 学生提问：如果不是因为定时器中断发生的切换，我们是不是可以期望ra寄存器指向其他位置，例如sleep函数？
>
> Robert教授：是的，我们之前看到了代码执行到这里会包含一些系统调用相关的函数。你基本上回答了自己的问题，如果我们因为定时器中断之外的原因而停止了执行当前的进程，switch会返回到一些系统调用的代码中，而不是我们这里看到sched函数。我记得sleep最后也调用了sched函数，虽然bracktrace可能看起来会不一样，但是还是会包含sched。所以我这里只介绍了一种进程间切换的方法，也就是因为定时器中断而发生切换。但是还有其他的可能会触发进程切换，例如等待I/O或者等待另一个进程向pipe写数据。
>

**这里有件事情需要注意，调度器线程调用了**`**swtch**`**函数，****<font style="background-color:#FBDE28;">但我们从swtch函数返回时，实际上是返回到了对于switch的另一个调用，而不是调度器线程中的调用。</font>**

**我们返回到的是**`**pid**`**为**`**4**`**的进程在很久之前对于**`**switch**`**的调用。这就是线程切换的核心。**

---

**另一件需要注意的事情是，**`**swtch**`**函数是线程切换的核心，但**`**swtch**`**函数中只有保存寄存器，再加载寄存器的操作。**

**线程除了寄存器以外的还有很多其他状态，它有变量，堆中的数据等等，这些所有的数据都还在内存中，并保持不变。我们没有改变线程的任何栈或者堆数据。**

**所以线程切换的过程中，处理器中的寄存器是唯一的不稳定状态，需要保存并恢复。而所有其他在内存中的数据会保存在内存中不被改变，所以不用特意保存并恢复。我们只是保存并恢复了处理器中的寄存器，因为我们想在新的线程中也使用相同的一组寄存器。**

## 11.9 线程第一次调用switch函数

（注，首先是学生提问Linux内一个进程多个线程的实现方式，因为在XV6中，一个进程只有一个用户线程）

> 学生提问：操作系统都带了线程的实现，如果想要在多个CPU上运行一个进程内的多个线程，那需要通过操作系统来处理而不是用户空间代码，是吧？那这里的线程切换是怎么工作的？是每个线程都与进程一样了吗？操作系统还会遍历所有存在的线程吗？比如说我们有8个核，每个CPU核都会在多个进程的更多个线程之间切换。同时我们也不想只在一个CPU核上切换一个进程的多个线程，是吧？
>
> Robert教授：Linux是支持一个进程包含多个线程，Linux的实现比较复杂，或许最简单的解释方式是：几乎可以认为Linux中的每个线程都是一个完整的进程。Linux中，我们平常说一个进程中的多个线程，本质上是共享同一块内存的多个独立进程。所以Linux中一个进程的多个线程仍然是通过一个内存地址空间执行代码。如果你在一个进程创建了2个线程，那基本上是2个进程共享一个地址空间。之后，调度就与XV6是一致的，也就是针对每个进程进行调度。
>
> 学生提问：用户可以指定将线程绑定在某个CPU上吗？操作系统如何确保一个进程的多个线程不会运行在同一个CPU核上？要不然就违背了多线程的初衷了。
>
> Robert教授：这里其实与XV6非常相似，假设有4个CPU核，Linux会找到4件事情运行在这4个核上。如果并没有太多正在运行的程序的话，或许会将一个进程的4个线程运行在4个核上。或者如果有100个用户登录在Athena机器上，内核会随机为每个CPU核找到一些事情做。
>
> 如果你想做一些精细的测试，有一些方法可以将线程绑定在CPU核上，但正常情况下人们不会这么做。
>
> 学生提问：所以说一个进程中的多个线程会有相同的page table？
>
> Robert教授：是的，如果你在Linux上，你为一个进程创建了2个线程，我不确定它们是不是共享同一个的page table，还是说它们是不同的page table，但是内容是相同的。
>
> 学生提问：有没有原因说这里的page table要是分开的？
>
> Robert教授：我不知道Linux究竟用了哪种方法。
>

**（注，以下是线程第一次调用switch的过程）也就是第一个线程**

**学生提问：当调用swtch函数的时候，实际上是从一个线程对于switch的调用切换到了另一个线程对于switch的调用。所以线程第一次调用swtch函数时，需要伪造一个“另一个线程”对于switch的调用，是吧？因为也不能通过swtch函数随机跳到其他代码去。**

**Robert教授：是的。我们来看一下第一次调用switch时，“另一个”调用swtch函数的线程的context对象。proc.c文件中的allocproc函数会被启动时的第一个进程和fork调用，allocproc会设置好新进程的context，如下所示：**

**<font style="background-color:#FBDE28;">memset(&p->context, 0, sizeof(p->context));伪造了“另一个”线程的</font>**`**<font style="background-color:#FBDE28;">context</font>**`

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MQaze0oj-FmvJMJ-YoM%252F-MQeahAhbIK9Y0WRKLpI%252Fimage.png%3Falt%3Dmedia%26token%3Dd12149c7-d087-4fe0-9c46-5dd961bc7e2a&width=768&dpr=4&quality=100&sign=49e37d8d&sv=1)

**实际上大部分寄存器的内容都无所谓。但ra很重要，因为这是进程的第一个switch调用会返回的位置。**

**同时因为进程需要有自己的栈，所以ra和sp都被设置了。**

**这里设置的forkret函数就是进程的第一次调用swtch函数会切换到的“另一个”线程位置。**

学生提问：所以当**swtch**函数返回时，CPU会执行**forkret**中的指令，就像**forkret**刚刚调用了**swtch**函数并且返回了一样？

Robert教授：是的，从**switch**返回就直接跳到了**forkret**的最开始位置。

学生提问：因吹斯听，我们会在其他场合调用**forkret**吗？还是说它只会用在这？

Robert教授：是的，它只会在启动进程的时候以这种奇怪的方式运行。下面是forkret函数的代码，

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MQaze0oj-FmvJMJ-YoM%252F-MQeca10yw76tC9PcDd4%252Fimage.png%3Falt%3Dmedia%26token%3D6f29a9a9-1c8b-429c-97b3-8ac6458168e0&width=768&dpr=4&quality=100&sign=ea116e40&sv=1)

> 从代码中看，它的工作其实就是释放调度器之前获取的锁。函数最后的usertrapret函数其实也是一个假的函数，它会使得程序表现的看起来像是从trap中返回，但是对应的trapframe其实也是假的，这样才能跳到用户的第一个指令中。
>
> 学生提问：与之前的context对象类似的是，对于trapframe也不用初始化任何寄存器，因为我们要去的是程序的最开始，所以不需要做任何假设，对吧？
>
> Robert教授：我认为程序计数器还是要被初始化为0的。
>

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MQaze0oj-FmvJMJ-YoM%252F-MQedlOtGM8Eilp35HqZ%252Fimage.png%3Falt%3Dmedia%26token%3D577bf761-608c-4832-b9a2-913985a558f5&width=768&dpr=4&quality=100&sign=1b0c6d4c&sv=1)

> 因为fork拷贝的进程会同时拷贝父进程的程序计数器，所以我们唯一不是通过fork创建进程的场景就是创建第一个进程的时候。这时需要设置程序计数器为0。
>
> 学生提问：在fortret函数中，if(first)是什么意思？
>
> Robert教授：文件系统需要被初始化，具体来说，需要从磁盘读取一些数据来确保文件系统的运行，比如说文件系统究竟有多大，各种各样的东西在文件系统的哪个位置，同时还需要有crash recovery log。完成任何文件系统的操作都需要等待磁盘操作结束，但是XV6只能在进程的context下执行文件系统操作，比如等待I/O。所以初始化文件系统需要等到我们有了一个进程才能进行。而这一步是在第一次调用forkret时完成的，所以在forkret中才有了if(first)判断。
>




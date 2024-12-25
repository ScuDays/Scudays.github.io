---
title: Lec09：Interrupts (Frans)(外部中断)
date: 2024-10-16 00:39:59
modify: 2024-12-22 16:41:05
author: days
category: 6S081
published: 2024-10-16
---
# Lec09：Interrupts (Frans)(外部中断)
## 9.1 真实操作系统内存使用情况

我想先讨论一下内存是如何被真实的操作系统（而不是像XV6这样的教学操作系统）所使用。

---

下图是一台Athena计算机（注，MIT内部共享使用的计算机）的top指令输出。

如果你查看Mem这一行：

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MN69TGmiTZbpoibdGcm%252F-MN6BJQ9QNJEWpp8cYwK%252Fimage.png%3Falt%3Dmedia%26token%3D1a507202-ad11-47d2-a608-ef65c847f25e&width=768&dpr=4&quality=100&sign=6c7f2b24&sv=1)

首先是计算机中总共有多少内存（33048332），如果你再往后看的话，你会发现大部分内存都被使用了（4214604 + 26988148）。但是大部分内存并没有被应用程序所使用，而是被 buff/cache 用掉了。

---

+ **这在一个操作系统中是常见的，因为我们不想让物理内存就在那闲置着，我们想让物理内存被用起来，所以这里大块的内存被用作buff/cache。可以看到还有一小块内存是空闲的（1845580），但是并不多。**

**以上是一个非常常见的场景，大部分操作系统运行时几乎没有任何空闲的内存。**

**这意味着，如果应用程序或者内核需要使用新的内存，那么我们需要丢弃一些已有的内容。**

**所以，当内核在分配内存的时候，操作成本通常都不低。因为并不总是有足够的可用内存，为了分配内存需要先撤回一些内存。**

+ 另外，我这里将 top 的输出按照 RES 进行了排序。如果你查看输出的每一行，VIRT表示的是虚拟内存地址空间的大小，RES 是实际使用的内存数量。**从这里可以看出，实际使用的内存数量远小于地址空间的大小。**

**所以，我们上节课讨论的基于虚拟内存和 page fault 提供的非常酷的功能在这都有使用，比如说 demand paging 。**

## 9.2 Interrupt 硬件部分（外部中断）

今天课程的主要内容是中断。

中断对应的场景很简单，就是硬件想要得到操作系统的关注。

例如

1. 网卡收到了一个 packet，网卡会生成一个中断；
2. 用户通过键盘按下了一个按键，键盘会产生一个中断。

**操作系统需要做的是，保存当前的工作，处理中断，处理完成之后再恢复之前的工作。**

**这里的保存和恢复工作，与我们之前看到的系统调用过程（注，详见 lec06）非常相似。所以系统调用，page fault，中断，都使用相同的机制。**

---

**但是中断又有一些不一样的地方，这就是为什么我们要花一节课的时间来讲它。中断与系统调用主要有 3 个小的差别：**

1. **asynchronous**。当硬件生成中断时，Interrupt handler 与当前运行的进程在 CPU 上没有任何关联。但**如果是系统调用的话，系统调用发生在运行进程的 context(上下文) 下。**
2. **concurrency**。对于中断来说，**CPU 和生成中断的设备是并行的在运行**。网卡自己独立的处理来自网络的 packet，然后在某个时间点产生中断，但同时 CPU 也在运行。**所以 CPU 和设备之间是真正的并行，我们必须管理这里的并行。**
3. **program device。我们这节课主要关注外部设备，例如网卡，UART，而这些设备需要被编程。**每个设备都有一个编程手册，就像 RISC-V 有一个包含了指令和寄存器的手册一样。设备的编程手册包含了它有什么样的寄存器，它能执行什么样的操作，在读写控制寄存器的时候，设备会如何响应。

---

**我们这节课的内容非常的简单。我们会讨论**

+ **console 中的提示符 “$” 是如何显示出来的**
+ **如果你在键盘输入 “ls”，这些字符是怎么最终在 console 中显示出来的。**

**这节课剩下的内容这两部分，以及背后相关的机制。**

---

我们首先要关心的是，中断是从哪里产生的？因为我们主要关心的是外部设备的中断，而不是定时器中断或者软件中断。

**外设中断来自于主板上的设备**。

下图是一个 SiFive 主板，如果你查看这个主板，你可以发现有大量的设备连接在或者可以连接到这个主板上。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNOedUoWwf-B8e0x8xX%252F-MNQgPHLVuAReIvEfuv_%252Fimage.png%3Falt%3Dmedia%26token%3D64896819-7b22-4c88-b654-41786fe49cd9&width=768&dpr=4&quality=100&sign=b60bf342&sv=1)

主板可以连接以太网卡，MicroUSB，MicroSD 等，主板上的各种线路将外设和 CPU 连接在一起。

下图是来自于 SiFive 有关处理器的文档，图中的右侧是各种各样的设备，例如 UART0。我们在之前的课程已经知道 UART0 会映射到内核内存地址的某处，而所有的物理内存都映射在地址空间的 0x80000000 之上。（注，详见 4.5）。类似于读写内存，通过向相应的设备地址执行 load/store 指令，我们就可以对例如 UART 的设备进行编程。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNOedUoWwf-B8e0x8xX%252F-MNQifH2z_uxd8s1bR7j%252Fimage.png%3Falt%3Dmedia%26token%3D6fa45459-e903-4e90-9fff-191f21dbbea9&width=768&dpr=4&quality=100&sign=2200e53d&sv=1)

所有的设备都连接到处理器上，处理器上是通过 `**Platform Level Interrupt Control**`，简称 PLIC 来处理设备中断。PLIC 会管理来自于外设的中断。如果我们再进一步深入的查看 PLIC 的结构图，

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNOedUoWwf-B8e0x8xX%252F-MNQmPRa0bzPQ99lcE2p%252Fimage.png%3Falt%3Dmedia%26token%3D35741a0d-0fc6-42e9-a841-15537f9fdaf4&width=768&dpr=4&quality=100&sign=eecccff4&sv=1)

从左上角可以看出，我们有 53 个不同的来自于设备的中断。**这些中断到达 PLIC 之后，PLIC 会路由这些中断。图的右下角是 CPU 的核，PLIC 会将中断路由到某一个 CPU 的核。如果所有的 CPU 核都正在处理中断，PLIC 会保留中断直到有一个 CPU 核可以用来处理中断**。所以 PLIC 需要保存一些内部数据来跟踪中断的状态。

如果你看过了文档，这里的具体流程是：

+ **PLIC 会通知当前有一个待处理的中断**
+ **其中一个 CPU 核会 Claim 接收中断，这样 PLIC 就不会把中断发给其他的 CPU 处理**
+ **CPU 核处理完中断之后，CPU 会通知 PLIC**
+ **PLIC 将不再保存中断的信息**

> 学生提问：PLIC 有没有什么机制能确保中断一定被处理？
>
> Frans 教授：这里取决于内核以什么样的方式来对 PLIC 进行编程。PLIC 只是分发中断，而内核需要对 PLIC 进行编程来告诉它中断应该分发到哪。实际上，内核可以对中断优先级进行编程，这里非常的灵活。
>

（注，以下提问来自课程结束部分，与本节内容时间上不连续）

> 学生提问：当 UART 触发中断的时候，所有的 CPU 核都能收到中断吗？
>
> Frans 教授：取决于你如何对 PLIC 进行编程。对于 XV6 来说，所有的 CPU 都能收到中断，但是只有一个 CPU 会 Claim 相应的中断。
>

## 9.3 设备驱动概述(bottom/top)
**通常来说，管理设备的代码称为驱动，xv6 中所有的驱动都在内核中。**

我们今天要看的是UART设备的驱动，代码在uart.c文件中。如果我们查看代码的结构，我们可以发现大部分驱动都分为两个部分，bottom/top。

+ **bottom 部分****<font style="background-color:#FBDE28;">通常是 Interrupt handler，用来处理中断。</font>****当一个中断送到了CPU，CPU会调用相应的 Interrupt handler。Interrupt handler 并不运行在任何特定进程的context中，它只是处理中断。**

**<font style="background-color:#FBDE28;">通常 Interrupt handler 存在一些限制，由于它并没有运行在任何进程的context中，所以进程的page table并不知道该从哪个地址读写数据，也就无法直接从 Interrupt handler 读写数据。</font>**

+ **top 部分，****<font style="background-color:#FBDE28;">是用户进程或者内核通过驱动调用硬件去完成任务的接口。</font>****对于UART来说，这里有read/write接口，这些接口可以被更高层级的代码调用。**

**驱动的top部分通常与用户的进程交互，并进行数据的读写**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/9821efee7ea041f80af9016adefa28a4.jpeg)

**通常情况下，驱动中会有一些队列（或者说buffer），top部分的代码会从队列中读写数据，而Interrupt handler（bottom部分）同时也会向队列中读写数据。这里的队列可以将并行运行的设备和CPU解耦开来。**

---

**接下来我们看一下如何对设备进行编程。**

通常来说，编程是通过memory mapped I/O完成的。

在SiFive的手册中，设备地址出现在物理地址的特定区间内，这个区间由主板制造商决定。

操作系统需要知道这些设备位于物理地址空间的具体位置，然后再通过普通的load/store指令对这些地址进行编程。load/store指令实际上的工作就是读写设备的控制寄存器。

例如，对网卡执行store指令时，CPU会修改网卡的某个控制寄存器，进而导致网卡发送一个packet。所以这里的load/store指令不会读写内存，而是会操作设备。所以需要阅读设备的文档来弄清楚设备的寄存器和相应的行为。

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/f274563fec215b11c5d768d3e057379a.jpeg)

下图中是SiFive主板中的对应设备的物理地址

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/4122c17f43631ce46b3f7391094bdad3.jpeg)

例如，0x200_0000对应CLINT，0xC000000对应的是PLIC。在这个图中UART0对应的是0x1001___0000，但是在QEMU中，我们的UART0的地址略有不同，因为在QEMU中我们并不是完全的模拟SiFive主板，而是模拟与SiFive主板非常类似的东西。

以上就是Memory-mapped IO。

下图是UART的文档。16550是QEMU模拟的UART设备，QEMU用这个模拟的设备来与键盘和Console进行交互。

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/b7badc10e7898530285e6aff3aaec5e0.jpeg)

这是一个很简单的芯片，图中表明了芯片拥有的寄存器。例如对于控制寄存器000，如果写它会将数据写入到寄存器中并被传输到其他地方，如果读它可以读出存储在寄存器中的内容。UART可以让你能够通过串口发送数据bit，在线路的另一侧会有另一个UART芯片，能够将数据bit组合成一个个Byte。

这里还有一些其他可以控制的地方，例如控制寄存器001，可以通过它来控制UART是否产生中断。实际上对于一个寄存器，其中的每个bit都有不同的作用。例如对于寄存器001，也就是IER寄存器，bit0-bit3分别控制了不同的中断。这个文档还有很多内容，但是对于我们这节课来说，上图就足够了。不过即使是这么简单的一个设备，它的文档也有很多页。

> 学生提问：如果你写入数据到Transmit Holding Register，然后再次写入，那么前一个数据不会被覆盖掉吗？
>
> Frans教授：这是我们需要注意的一件事情。我们通过load将数据写入到这个寄存器中，之后UART芯片会通过串口线将这个Byte送出。当完成了发送，UART会生成一个中断给内核，这个时候才能再次写入下一个数据。所以内核和设备之间需要遵守一些协议才能确保一切工作正常。上图中的UART芯片会有一个容量是16的FIFO，但是你还是要小心，因为如果阻塞了16个Byte之后再次写入还是会造成数据覆盖。
>

## 9.4 XV6设置打开硬件中断的通路（设备->PLIC->CPU）

下面讨论下在 XV6 中如何打开**设备->PLIC->CPU 这条路中的中断，**如何

---

当XV6启动时，Shell会输出提示符“$ ”，如果我们在键盘上输入ls，最终可以看到“$ ls”。

**我们接下来通过研究Console是如何显示出“$ ls”，来看一下设备中断是如何工作的。**

**实际上“$ ”和“ls”还不太一样，“$ ”是Shell程序的输出，而“ls”是用户通过键盘输入之后再显示出来的。**

+ **对于“$ ”，实际上设备会将字符传输给UART的寄存器，UART之后会在发送完字符之后产生一个中断。在QEMU中，模拟的线路的另一端会有另一个UART芯片（模拟的），这个UART芯片连接到了虚拟的Console，它会进一步将“$ ”显示在console上。**
+ **对于“ls”，这是用户输入的字符。键盘连接到了UART的输入线路，当你在键盘上按下一个按键，UART芯片会将按键字符通过串口线发送到另一端的UART芯片。另一端的UART芯片先将数据bit合并成一个Byte，之后再产生一个中断，并告诉处理器说这里有一个来自于键盘的字符。之后Interrupt handler会处理来自于UART的字符。**

我们接下来会深入通过这两部分来弄清楚这里是如何工作的。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNYn8xQ_nM7UyU1sa-g%252F-MN_zlccGc5Fd8klMxRQ%252Fimage.png%3Falt%3Dmedia%26token%3D5665e882-bc5a-470a-a37b-1ef6b2616ee7&width=768&dpr=4&quality=100&sign=62edbb36&sv=1)

**RISC-V有许多与中断相关的寄存器：**

+ **SIE（Supervisor Interrupt Enable）寄存器**。

这个寄存器中有一个bit（E）专门针对例如UART的外部设备的中断；

有一个bit（S）专门针对软件中断，软件中断可能由一个CPU核触发给另一个CPU核；

还有一个bit（T）专门针对定时器中断。我们这节课只关注外部设备的中断。

+ **SSTATUS（Supervisor Status）寄存器**。

这个寄存器中有一个bit来打开或者关闭中断。**每一个CPU核都有独立的SIE和SSTATUS寄存器**，除了通过SIE寄存器来单独控制特定的中断，还可以通过 SSTATUS 寄存器中的一个bit来控制所有的中断。

+ **SIP（Supervisor Interrupt Pending）寄存器**。

当发生中断时，处理器可以通过查看这个寄存器知道当前是什么类型的中断。

+ **SCAUSE（Supervisor Cause Register）寄存器**

该寄存器用于记录中断或异常的原因，帮助操作系统决定如何处理当前的中断或异常

+ **STVEC（ 寄存器的全名是“Supervisor Trap Vector Base Address Register”  ）寄存器**

它会保存当trap，page fault或者中断发生时，CPU运行的用户程序的程序计数器，这样才能在稍后恢复程序的运行。

**我们今天不会讨论SCAUSE和STVEC寄存器，因为在中断处理流程中，它们基本上与之前（注，lec06）的工作方式是一样的。接下来我们看看XV6是如何对其他寄存器进行编程，使得CPU处于一个能接受中断的状态。**

---

**代码开始**

接下来看看代码，首先是位于start.c的start函数。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNYn8xQ_nM7UyU1sa-g%252F-MNa5Rv4ANj0GOmpMXf9%252Fimage.png%3Falt%3Dmedia%26token%3D99fa1a9b-b983-46ec-9c0f-616220592cd9&width=768&dpr=4&quality=100&sign=7b68158f&sv=1)

**这里将所有的中断都设置在Supervisor mode，然后设置 SIE寄存器来开启接收外部，软件和定时器中断**

之后初始化定时器。w_mepc((uint64)main)设置 mepc 为 main，start() 最后 mret 后会执行 main 函数 

接下来我们看一下main函数中是如何处理External中断。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNYn8xQ_nM7UyU1sa-g%252F-MNa6N7vHde52fObSxUz%252Fimage.png%3Falt%3Dmedia%26token%3D65580d62-73c5-46eb-8767-e2fde2daac36&width=768&dpr=4&quality=100&sign=c3cbd668&sv=1)

我们第一个外设是console，这是我们print的输出位置。查看位于console.c的consoleinit函数。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNYn8xQ_nM7UyU1sa-g%252F-MNa6mHXaOc6Dtv5U6bj%252Fimage.png%3Falt%3Dmedia%26token%3D80ea954c-2230-4eba-adcf-1a8e386bdb4a&width=768&dpr=4&quality=100&sign=2234ae1c&sv=1)

**这里首先初始化了锁。**

**然后调用了uartinit，uartinit函数位于uart.c文件。这个函数实际上就是配置好UART芯片使其可以被使用。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNYn8xQ_nM7UyU1sa-g%252F-MNa7OdMH3taGmHfE7Wj%252Fimage.png%3Falt%3Dmedia%26token%3D0538d371-3758-431d-98e6-907f5f5a6ab9&width=768&dpr=4&quality=100&sign=3020f0fc&sv=1)

**这里的流程是先关闭中断，之后设置波特率，设置字符长度为8bit，重置FIFO，最后再重新打开中断。**

**以上就是uartinit函数，运行完这个函数之后，原则上UART就可以生成中断了。**

**但我们还没有对PLIC编程，所以中断不能被CPU感知并接收。**

**最终，在main函数中，需要调用plicinit函数。下图是plicinit函数。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNa7TJFrEQk2gYzkwCG%252F-MNcl8NhzO719lb6xtPl%252Fimage.png%3Falt%3Dmedia%26token%3Dceb45ee2-8509-48fb-9166-7d6bc9930fef&width=768&dpr=4&quality=100&sign=53db6e48&sv=1)

**PLIC与外设一样，也占用了一个I/O地址（0xC000_0000）。**

**代码的第一行使能了UART的中断，这里实际上就是设置PLIC会接收哪些中断，进而将中断路由到CPU。**

**代码的第二行设置PLIC接收来自IO磁盘的中断。**

**main函数中，plicinit之后就是plicinithart函数。目前 plicinit是由0号CPU运行，之后，每个CPU的核都需要调用plicinithart函数表明对于哪些外设中断感兴趣。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNa7TJFrEQk2gYzkwCG%252F-MNcmoGEKLSU8ifrGFC6%252Fimage.png%3Falt%3Dmedia%26token%3D4bbb1a15-4f10-427c-961e-51b801adf8ef&width=768&dpr=4&quality=100&sign=2726fdc0&sv=1)

**在plicinithart函数中，每个CPU的核都表明自己对来自于UART和VIRTIO的中断感兴趣。**

**通过设置PLIC（平台级中断控制器）。这个过程涉及设置中断使能位，使特定的中断源（如UART和VirtIO设备）能够在S模式（监督模式）下被当前的hart（硬件线程）处理。  **

因为我们忽略中断的优先级，所以我们将优先级设置为0。

**到目前为止，我们有了生成中断的外部设备，****<font style="background-color:#FBDE28;">我们有了PLIC可以传递中断到单个的CPU（plicinithart 中设置）</font>****。但是CPU自己还没有设置好接收中断，因为我们还没有设置好SSTATUS寄存器。在main函数的最后，程序调用了scheduler函数，**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNa7TJFrEQk2gYzkwCG%252F-MNcnlTuggw_Il7m9iIW%252Fimage.png%3Falt%3Dmedia%26token%3Dac9df287-e059-4438-957e-548f1b22e030&width=768&dpr=4&quality=100&sign=6e7d70b9&sv=1)

**scheduler函数主要是运行进程。**

**但在实际运行进程之前，会执行intr_on函数来使得CPU能接收中断。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNa7TJFrEQk2gYzkwCG%252F-MNcoC3QhbWZHXRz2BEt%252Fimage.png%3Falt%3Dmedia%26token%3Deca193c8-ff3d-4d96-b837-5cfbbc2b2ecc&width=768&dpr=4&quality=100&sign=90f40e4c&sv=1)

**intr_on函数只完成一件事情，就是设置SSTATUS寄存器，打开中断标志位。设置CPU 可以接收中断**

**这时候，中断被完全打开了。如果PLIC正好有pending的中断，那么这个CPU核会收到中断。**

**以上就是中断的基本设置。**

## 9.5 UART驱动的top部分(用户进程或内核直接调用驱动)
**我们来看用户进程或者内核如何直接调用驱动去为我们完成任务**

---

**例子：看一下 Shell 程序如何输出提示符 “$” 到 Console。**

**首先我们看 init.c 中的 main 函数，这是系统启动后运行的第一个进程。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNa7TJFrEQk2gYzkwCG%252F-MNcplHF86eYTpFW_ztO%252Fimage.png%3Falt%3Dmedia%26token%3De445273b-fd4d-4b8f-ad9a-100f621a2b62&width=768&dpr=4&quality=100&sign=ad65850e&sv=1)

**首先这个进程的 main 函数**

1. **通过 mknod 操作创建了一个代表 console 设备。**
2. **因为这是第一个打开的文件，所以文件描述符为 0。**
3. **再通过 dup() 创建 stdout 和 stderr。这里实通过复制文件描述符 0，得到了另外两个文件描述符 1，2。且 文件描述符 0，1，2 都指向 Console。**
4. **之后运行 sh 程序**
5. **sh 调用 getcmd() 向文件描述符 2 打印提示符 “$”。**

---

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNa7TJFrEQk2gYzkwCG%252F-MNcqqRtbogpSiiEpc2P%252Fimage.png%3Falt%3Dmedia%26token%3Da1ae7eb6-b01d-4886-93ba-771f0bbe4182&width=768&dpr=4&quality=100&sign=5675d239&sv=1)

**尽管 Console 背后是 UART 设备，但从应用程序的视角来看，它就是一个普通的文件。**

**Shell 程序只是向文件描述符 2 写了数据，它并不知道文件描述符 2 对应的是什么。**

**在 Unix 系统中，设备是由文件表示。我们来看一下这里的 fprintf 是如何工作的。**

**在 printf.c 文件中，代码只是调用了 write 系统调用，在我们的例子中，fd 对应的就是文件描述符 2，c 是字符 “$”。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNa7TJFrEQk2gYzkwCG%252F-MNcryjzrhmCyPc7r_gD%252Fimage.png%3Falt%3Dmedia%26token%3Dbaf1d557-0d54-47c4-8cdf-29f409a1d04d&width=768&dpr=4&quality=100&sign=c1ffa05e&sv=1)

**所以由 Shell 输出的每一个字符都会触发一个 write 系统调用。之前我们已经看过了 write 系统调用最终会走到 sysfile.c 文件的 sys_write 函数。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNa7TJFrEQk2gYzkwCG%252F-MNcsd0dxYGOsPE0DkWF%252Fimage.png%3Falt%3Dmedia%26token%3D690b04c3-fff7-4c46-85a0-44038c36c101&width=768&dpr=4&quality=100&sign=eb3067fc&sv=1)

**这个函数中首先对参数做了检查，然后调用了 filewrite 函数。filewrite 函数位于 file.c 文件中。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNa7TJFrEQk2gYzkwCG%252F-MNct2PHzPhwjA3hvi6V%252Fimage.png%3Falt%3Dmedia%26token%3D30bb0476-6724-473c-a36f-6ed0de37104f&width=768&dpr=4&quality=100&sign=a35991d8&sv=1)

**filewrite 函数中首先会判断文件描述符的类型。**

**mknod 生成的文件描述符属于设备（FD_DEVICE），**

**对于设备类型的文件描述符，我们会为这个特定的设备执行设备相应的 write 函数。**

**我们现在的设备是 Console，所以这里会调用 console.c 中的 consolewrite 函数。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNa7TJFrEQk2gYzkwCG%252F-MNctcQci75CDpfVpdRq%252Fimage.png%3Falt%3Dmedia%26token%3D08880b86-4d8f-4b67-aa3c-cc5ce6cb17b0&width=768&dpr=4&quality=100&sign=20ff93be&sv=1)

**这里先通过 either_copyin 将字符拷入，之后调用 uartputc 函数。**

**<font style="background-color:#FBDE28;">uartputc 函数将字符写入到 UART 设备的发送缓冲区中</font>**

**所以你可以认为 consolewrite 是一个 UART 驱动的 top 部分。uart.c 文件中的 uartputc 函数会实际的打印字符。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNa7TJFrEQk2gYzkwCG%252F-MNcu9oxFUI2qpie5z4T%252Fimage.png%3Falt%3Dmedia%26token%3Db0201ce3-225c-4696-a5e4-348e1b081bcc&width=768&dpr=4&quality=100&sign=8ad825e4&sv=1)

**uartputc 函数会稍微有趣一些。**

**在 UART 的内部会有一个 buffer 用来暂存发送数据（发送数据缓冲区），buffer 的大小是 32 个字符。同时还有一个为 consumer 提供的读指针和为 producer 提供的写指针，来构建一个环形的 buffer（注，或者可以认为是环形队列）。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNa7TJFrEQk2gYzkwCG%252F-MNcudamCocCj7PtfYpv%252Fimage.png%3Falt%3Dmedia%26token%3Df9ff4004-3b5d-4c5a-bbf2-676d10dc2033&width=768&dpr=4&quality=100&sign=d2c1570b&sv=1)

**在我们的例子中，Shell 是 producer，所以需要调用 uartputc 函数。**

1. **在函数中第一件事情是判断环形 buffer 是否已经满了。**
2. **如果读写指针相同，那么 buffer 是空的，**
3. **如果写指针加 1 等于读指针，那么 buffer 满了。**
4. **当 buffer 是满的时候，向其写入数据是没有意义的，所以这里会 sleep 一段时间，将 CPU 出让给其他进程。**
5. **当然，对于我们来说，buffer 必然不是满的，因为提示符 “$” 是我们送出的第一个字符。所以代码会走到 else，字符会被送到 buffer 中，更新写指针，之后再调用 uartstart 函数。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNcv-xytcPNjgcA09N-%252F-MNfDMD08BsxVVcKpVl3%252Fimage.png%3Falt%3Dmedia%26token%3D58e70d9b-7dd2-46bb-8243-bb188dcb8307&width=768&dpr=4&quality=100&sign=d0ae433&sv=1)

**如果 buffer 没有满，则调用 uartstart 函数**

**uartstart 作用是通知设备执行操作。**

**首先检查当前设备是否空闲，**

+ **如果空闲的话**

**我们会从 buffer 中读出数据，然后将数据写入到 THR（Transmission Holding Register）发送寄存器。这里相当于告诉设备，我这里有一个字节需要你来发送。一旦数据送到了设备，系统调用会返回，用户应用程序 Shell 可以继续执行。这里从内核返回到用户空间的机制与 lec06 的 trap 机制是一样的。**

+ **如果并不空闲 **

**if((ReadReg(LSR) & LSR_TX_IDLE) == 0) 用来检查，就会返回。数据会留在暂存区域中不会发送**

+ **<font style="background-color:#FBDE28;">那这个数据什么时候会被发送呢？</font>**

**<font style="background-color:#FBDE28;">UART设备在THR空闲时会触发发送中断，因此当设备准备好时，UART驱动的bottom部分，也就是中断处理程序会再次调用uartstart()，进行发送。</font>**

> **这就是用户进程或内核直接调用驱动的流程，下面我们将会讲解驱动处理中断的流程**
>

## **<font style="color:rgb(38, 38, 38);">9.6 UART驱动的bottom部分(驱动处理外部中断)</font>**
**在我们向Console输出字符时，****在某个时间点，我们会收到中断（UART 准备好发送的发送中断），因为我们之前设置了要处理 UART 设备中断。接下来我们看一下，当发生中断时，驱动要怎么处理这个中断。**

---

**当某一个时间，如果发生了中断（外部中断），RISC-V 会做什么操作？**

**我们之前已经在 SSTATUS 寄存器中打开了中断，所以处理器会被中断。假设键盘生成了一个中断并且发向了 PLIC，PLIC 路由中断给一个特定的 CPU 核，并且如果这个 CPU 核设置了 SIE 寄存器的 E bit（注，针对外部中断的 bit 位），那么会发生以下事情：**

+ 首先，会清除 SIE 寄存器相应的 bit，这样可以阻止 CPU 核被其他中断打扰，该 CPU 核可以专心处理当前中断。处理完成之后，可以再次恢复 SIE 寄存器相应的 bit。
+ 之后，会设置 SEPC 寄存器为当前的程序计数器。我假设 Shell 正在用户空间运行，突然来了一个中断，那么当前 Shell 的程序计数器会被保存。
+ 之后，要保存当前的 mode。在我们的例子里面，因为当前运行的是 Shell 程序，所以会记录 user mode。
+ 再将 mode 设置为 Supervisor mode。
+ 最后将程序计数器的值设置成 STVEC 的值。（注，STVEC 用来保存 trap 处理程序的地址，详见 lec06）在 XV6 中，STVEC 保存的要么是 uservec 或者 kernelvec 函数的地址，具体取决于发生中断时程序运行是在用户空间还是内核空间。在我们的例子中，Shell 运行在用户空间，所以 STVEC 保存的是 uservec 函数的地址。而从之前的课程我们可以知道 uservec 函数会调用 usertrap 函数。所以最终，我们在 usertrap 函数中。~~我们这节课不会介绍 trap 过程中的拷贝，恢复过程，因为在之前的课程中已经详细的介绍过了。~~

**接下来看一下 trap.c 文件中的 usertrap 函数，我们在 lec06 和 lec08 分别在这个函数中处理了系统调用和 page fault。今天我们将要看一下如何处理外部中断。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNfH5qMvmyxhegTFSUo%252F-MNpbLBt88M7WKDIGi4a%252Fimage.png%3Falt%3Dmedia%26token%3D6b9561db-5941-4caa-8187-809dae89a377&width=768&dpr=4&quality=100&sign=feb9d1da&sv=1)

**在 trap.c 的 devintr 函数中，首先会通过 SCAUSE 寄存器判断当前中断是否是来自于外设的中断。如果是的话，再调用 plic_claim 函数来获取中断。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNfH5qMvmyxhegTFSUo%252F-MNpcUmolzUjQhGtVWpo%252Fimage.png%3Falt%3Dmedia%26token%3Da894536b-a241-4230-8c0e-300d556275b6&width=768&dpr=4&quality=100&sign=28b475e8&sv=1)

**plic_claim 函数位于 plic.c 文件中。在这个函数中，当前 CPU 核会告知 PLIC，自己要处理中断，PLIC_SCLAIM 会将中断号返回，对于 UART 来说，返回的中断号是 10。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNfH5qMvmyxhegTFSUo%252F-MNpdQCYQP1Gcv_HTm7o%252Fimage.png%3Falt%3Dmedia%26token%3D3dca463c-486f-4c96-87da-bc8401a65e94&width=768&dpr=4&quality=100&sign=3c30e6e7&sv=1)

**从 devintr 函数可以看出，如果是 UART 中断，那么会调用 uartintr 函数。位于 uart.c 文件的 uartintr 函数，我们现在讨论的是向 UART 发送数据。因为我们现在还没有通过键盘输入任何数据，所以 UART 的接受寄存器现在为空。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNfH5qMvmyxhegTFSUo%252F-MNpeCI5zYrIAIDEUzeD%252Fimage.png%3Falt%3Dmedia%26token%3D796177bb-eeb4-45d8-8502-2c60fac1b5ec&width=768&dpr=4&quality=100&sign=67c1d108&sv=1)

**函数 uartintr 处理中断，同时处理可能的输入以及输出**

**<font style="background-color:#FBDE28;">所以代码会直接运行到 uartstart 函数( top 部分中最后调用的函数)</font>**

**这样，驱动的 top 部分和 bottom 部分就解耦开了。**

## 9.7 Interrupt相关的并发

接下来我们讨论一下与中断相关的并发，并发加大了中断编程的难度。这里的并发包括以下几个方面：

+ Between device and CPU. 在设备与CPU并行时，需要引入一些并发模型，如生产者/消费者模型，在 UART 处理键盘输入时，设备是生产者，CPU是消费者；但在处理输出时，则反之。
+ Interrupt may interrupt the CPU that is returning to shell (still in kernel). 所以需要在陷入时关闭中断，保证代码原子性。
+ Interrupt may run on different CPU in parallel with shell (or returning to shell). 多个 CPU 同时处理中断，并行化需要锁来保证一致性。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNpiXXVKJdvWgWqzH_y%252F-MNrnl9JPFsR7yfGEs6s%252Fimage.png%3Falt%3Dmedia%26token%3D33e68a99-8451-4d9e-b6b4-d9fe0f6d95a2&width=768&dpr=4&quality=100&sign=f689ea3c&sv=1)

+ **producer/consumser 并发。**

这是驱动中的非常常见的典型现象。驱动会有一个 buffer，在我们之前的例子中，buffer 是 32 字节大小。并且有两个指针，分别是读指针和写指针。

如果两个指针相等，那么 buffer 是空的。当 Shell 调用 uartputc 函数时，会将字符，例如提示符 “$”，写入到写指针的位置，并将写指针加 1。这就是 producer 对于 buffer 的操作。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNpiXXVKJdvWgWqzH_y%252F-MNropRpuu-7GKNWhYvX%252Fimage.png%3Falt%3Dmedia%26token%3Dbf27dc51-13bc-46ca-b6ab-70d1ce8bf297&width=768&dpr=4&quality=100&sign=6221911e&sv=1)

producer 可以一直写入数据，直到写指针 + 1 等于读指针，因为这时，buffer 已经满了。当 buffer 满了的时候，producer 必须停止运行。我们之前在 uartputc 函数中看过，如果 buffer 满了，代码会 sleep，暂时搁置 Shell 并运行其他的进程。

+ **Interrupt handler，也就是 uartintr 函数，**

在这个场景下是 consumer，每当有一个中断，并且读指针落后于写指针，uartintr 函数就会从读指针中读取一个字符再通过 UART 设备发送，并且将读指针加 1。当读指针追上写指针，也就是两个指针相等的时候，buffer 为空，这时就不用做任何操作。

> 学生提问：这里的 buffer 对于所有的 CPU 核都是共享的吗？
>
> Frans 教授：这里的 buffer 存在于内存中，并且只有一份，所以，所有的 CPU 核都并行的与这一份数据交互。所以我们才需要 lock。
>
> 学生提问：对于 uartputc 中的 sleep，它怎么知道应该让 Shell 去 sleep？
>
> Frans 教授： sleep 会将当前在运行的进程存放于 sleep 数据中。它传入的参数是需要等待的信号，在这个例子中传入的是 uart_tx_r 的地址。在 uartstart 函数中，一旦 buffer 中有了空间，会调用与 sleep 对应的函数 wakeup，传入的也是 uart_tx_r 的地址。任何等待在这个地址的进程都会被唤醒。有时候这种机制被称为 conditional synchronization。
>

以上就是 Shell 输出提示符 “$” 的全部内容。如你们所见，过程还挺复杂的，许多代码一起工作才将这两个字符传输到了 Console。

## 9.8 UART读取键盘输入

在 UART 的另一侧，会有类似的事情发生，有时 Shell 会调用 read 从键盘中读取字符。

 在 read 系统调用的底层，会调用 fileread 函数。在这个函数中，如果读取的文件类型是设备，会调用相应设备的 read 函数。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNpiXXVKJdvWgWqzH_y%252F-MNrubhKUjW6DnLvxjQ6%252Fimage.png%3Falt%3Dmedia%26token%3D04539d08-79e8-463e-ad43-79b36da29eaa&width=768&dpr=4&quality=100&sign=fa3bf6aa&sv=1)

在我们的例子中，read 函数就是 console.c 文件中的 consoleread 函数。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNpiXXVKJdvWgWqzH_y%252F-MNrv41RJWmQNiCKb4Ve%252Fimage.png%3Falt%3Dmedia%26token%3De274c0e1-526c-49ab-83f9-f2a15447cd8f&width=768&dpr=4&quality=100&sign=38f5673&sv=1)

这里与 UART 类似，也有一个 buffer，包含了 128 个字符。其他的基本一样，也有 producer 和 consumser。但是在这个场景下 Shell 变成了 consumser，因为 Shell 是从 buffer 中读取数据。而键盘是 producer，它将数据写入到 buffer 中。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNpiXXVKJdvWgWqzH_y%252F-MNrvQJe25cNXU0LuIaw%252Fimage.png%3Falt%3Dmedia%26token%3D3a872797-b8ed-4d68-86ff-ff24403d2475&width=768&dpr=4&quality=100&sign=4a6563e4&sv=1)

从 consoleread 函数中可以看出，当读指针和写指针一样时，说明 buffer 为空，进程会 sleep。

所以 Shell 在打印完 “$” 之后，如果键盘没有输入，Shell 进程会 sleep，直到键盘有一个字符输入。

所以在某个时间点，假设用户通过键盘输入了 “l”，这会导致“l” 被发送到主板上的 UART 芯片，产生中断之后再被 PLIC 路由到某个 CPU 核，之后会触发 devintr 函数，devintr 可以发现这是一个 UART 中断，然后通过 uartgetc 函数获取到相应的字符，之后再将字符传递给 consoleintr 函数。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNrxZk5JKK8WT1bCv_K%252F-MNs0P8PukOn1-st2X5I%252Fimage.png%3Falt%3Dmedia%26token%3Dae576029-e271-4a0f-8c6e-ae85b1272d76&width=768&dpr=4&quality=100&sign=c6d65c0c&sv=1)

默认情况下，字符会通过 consputc，输出到 console 上给用户查看。之后，字符被存放在 buffer 中。在遇到换行符的时候，唤醒之前 sleep 的进程，也就是 Shell，再从 buffer 中将数据读出。

所以这里也是通过 buffer 将 consumer 和 producer 之间解耦，这样它们才能按照自己的速度，独立的并行运行。如果某一个运行的过快了，那么 buffer 要么是满的要么是空的，consumer 和 producer 其中一个会 sleep 并等待另一个追上来。

## 9.9 Interrupt的演进
**中断曾经相对较快，现在偏慢。**

+ **old approach 每一个 event 引发一次中断，硬件很简单，软件很容易处理。**
+ **new approach 硬件在中断前完成许多工作。**

**现在很多设备生成中断事件快于 one per microsecond ，例如 gigabit 以太网可以每秒传递 1.5 million 的包。中断花费开销为 microsecond 级别。**

### Polling: another way of interacting with devices 轮询
**处理器可以保持 spin 直到设备需要关注，比如 consoleread** **不 sleep 而是一直 spin 进行请求。如 Xv6 的 uartputc_sync 函数如此实现。**

+ **Pro: inexpensive if device is fast. No saving of registers etc. If events are always waiting, no need to keep alerting the software.**
+ **Con: Wastes processor cycles if device is slow**

**对于高速设备， Polling 要优于中断。但对于低速设备，如键盘，中断更好，轮询反而会浪费 CPU 时间。所以 OS 可以为不同速度的设备，在两种方式间切换。**

### DMA(direct memory access)
**UART驱动程序通过读UART控制寄存器检索数据字节；此模式称为 programmed I/O，因为软件推动数据移动。 Programmed I/O很简单，但太慢，无法以高数据速率使用。需要高速移动大量数据的设备通常使用直接内存访问（DMA）。DMA设备硬件直接将传入的数据写入RAM，并从RAM读取传出数据。**

**现代磁盘和网络设备一般使用DMA。DMA设备的驱动程序将在RAM中准备数据，然后使用一次写入控制寄存器来告诉设备处理准备好的数据。**

**UART驱动程序首先将传入的数据复制到内核中的缓冲区，然后再复制到用户空间。这在低数据速率下是有意义的，但这种双重拷贝会显著降低生成或消耗数据非常快的设备的性能。一些操作系统能够直接在用户空间缓冲区和设备硬件之间移动数据，这通常使用DMA实现。**

### Safety
**设备中断要求系统在有限时间内回应，对于一些安全相关的系统错过 deadline 时间会导致灾难。xv6 并不适合这种硬实时设置。一个硬实时OS将提供许多库与应用链接，允许实现最坏情况回应时间的分析。但 xv6 也不是软实时系统，软实时系统在错过 deadline 时通常可以接受。因为 Xv6 的 scheduler 过于简单且 kernel code path 会长时间关闭中断。从此，我们可以学习真正在有限时间回应的OS需要，**

+ **hard 库与应用链接，分析最坏时间。**
+ **soft 精细的调度机制与较短的关闭中断的 kernel code path 。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MNrxZk5JKK8WT1bCv_K%252F-MNs7Tl17pUS0sqmxtf8%252Fimage.png%3Falt%3Dmedia%26token%3D72c4aa65-b9ab-4b42-bf63-f0c0b515861d&width=768&dpr=4&quality=100&sign=eb821278&sv=1)

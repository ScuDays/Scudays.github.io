---
title: Lec06：Isolation & system call entry!exit (Robert)
date: 2024-08-19 00:39:59
modify: 2024-12-22 16:41:01
author: days
category: 6S081
published: 2024-08-19
---
# Lec06：Isolation & system call entry/exit (Robert)
## 6.1 Trap机制
**每当**

+ **程序执行系统调用**
+ **程序出现了类似page fault、运算时除以0的错误**
+ **一个设备触发了中断使得当前程序运行需要响应内核设备驱动**

**都会发生完成用户空间和内核空间的切换。**

**这里用户空间和内核空间的切换通常被称为trap，而trap涉及了许多小心的设计和重要的细节，这些细节对于实现安全隔离和性能来说非常重要。因为很多应用程序，因为系统调用或者 page fault，会频繁的切换到内核中。所以，trap机制要尽可能的简单，这一点非常重要。**

> **例如Shell，它运行在用户空间，同时我们还有内核空间。Shell可能会执行系统调用，将程序运行切换到内核。**
>
> **比如XV6启动之后Shell输出的一些提示信息，就是通过执行write系统调用切换到内核来输出的。**
>

**以下是 Shell尝试执行wrtie系统调用的一个例子。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/afdee4563acf1377910baa29e493a855.jpeg)

**我们需要清楚程序是如何从****<font style="background-color:#FBDE28;">只拥有user权限并且位于用户空间的Shell，切换到拥有supervisor权限的内核。</font>**

**在这个过程中，硬件的状态将会非常重要，因为我们很多的工作都是****<font style="background-color:#FBDE28;">将硬件从适合运行用户应用程序的状态，改变到适合运行内核代码的状态。</font>**

**我们最关心的是32个用户寄存器，这在上节课中有介绍。**

**RISC-V总共有32个比如a0，a1这样的寄存器，用户应用程序可以使用全部的寄存器，并且使用寄存器的指令性能是最好的。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/50ee4b019eddd520e222e31d9a4d4dec.jpeg)

**这里的很多寄存器都有特殊的作用。其中一个特别有意思的寄存器是stack pointer（也叫做堆栈寄存器 stack register）。**

**此外，**

+ **在硬件中还有一个寄存器叫做程序计数器（Program Counter Register）。**
+ **表明当前mode的标志位，这个标志位表明了当前是supervisor mode还是user mode。当我们在运行Shell的时候，自然是在user mode。**
+ **还有一堆控制CPU工作方式的寄存器，比如SATP（Supervisor Address Translation and Protection）寄存器，它包含了指向page table的物理内存地址（详见4.3）。**
+ **还有一些非常重要的寄存器，比如STVEC（Supervisor Trap Vector Base Address Register）寄存器，它指向了内核中处理trap的指令的起始地址。**
+ **SEPC（Supervisor Exception Program Counter）寄存器，在trap的过程中保存程序计数器的值。**
+ **SSRATCH（Supervisor Scratch Register）寄存器，这也是个非常重要的寄存器（详见6.5）。**

**这些寄存器表明了执行系统调用时计算机的状态。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/fd5141d96e761738204429a7a3470023.jpeg)

**可以肯定的是，****<font style="background-color:#FBDE28;">在trap的最开始，CPU的所有状态都设置成运行用户代码而不是内核代码。在trap处理的过程中，我们需要更改一些这里的状态。这样我们才可以运行系统内核中普通的C程序。</font>******

**接下来我们先来预览一下需要做的操作：**

+ **首先，我们需要保存32个用户寄存器的数据。很显然我们需要在 trap 之后恢复用户应用程序，尤其是当用户程序随机被设备中断所打断时。我们希望内核能够响应中断，之后在用户程序完全无感知的情况下再恢复用户代码的执行。所以这意味着32个用户寄存器的数据不能被内核更改。但是这些寄存器又要被内核代码所使用，所以在trap之前，你必须先在某处保存这32个用户寄存器。**
+ **程序计数器也需要在某个地方保存，它几乎跟一个用户寄存器的地位是一样的，我们需要能够在用户程序运行中断的位置继续执行用户程序。**
+ **我们需要将mode改成supervisor mode，因为我们想要使用内核中的各种各样的特权指令。**
+ **SATP寄存器现在正指向user page table，而user page table只包含了用户程序所需要的内存映射和一两个其他的映射，它并没有包含整个内核数据的内存映射。所以在运行内核代码之前，我们需要将SATP指向kernel page table。**
+ **我们需要将堆栈寄存器指向位于内核的一个地址，因为我们需要一个堆栈来调用内核的C函数。**
+ **一旦我们设置好了，并且所有的硬件状态都适合在内核中使用， 我们需要跳入内核的C代码。**

> + **一旦我们运行在内核的C代码中，那就跟平常的C代码是一样的。**
> + **之后我们会讨论内核通过C代码做了什么工作，但是今天的讨论是如何从将程序执行从用户空间切换到内核的一个位置，这样我们才能运行内核的C代码。**
>

---

**high-level 的安全和隔离**

**操作系统的一些high-level的目标能帮我们过滤一些实现选项。**

**<font style="background-color:#FBDE28;">其中一个目标是安全和隔离，我们不想让用户代码介入到这里的user/kernel切换，否则有可能会破坏安全性。</font>**

**<font style="background-color:#FBDE28;">这意味着，trap中涉及到的硬件和内核机制不能依赖任何来自用户空间东西。</font>**

**<font style="background-color:#FBDE28;">比如说我们不能依赖32个用户寄存器，它们可能保存的是恶意的数据。</font>**

**<font style="background-color:#FBDE28;">所以，XV6的trap机制不会查看这些寄存器，而只是将它们保存起来。</font>**

**在操作系统的trap机制中，我们仍然想保留隔离性并防御来自用户代码的可能的恶意攻击。另一方面同样也很重要的是，我们想要让trap机制对用户代码是透明的，也就是说我们想要执行trap，然后在内核中执行代码，同时用户代码并不会察觉到任何事情。**

**需要注意的是，虽然我们这里关心隔离和安全，但是今天我们只会讨论从用户空间切换到内核空间相关的安全问题。当然，系统调用的具体实现，比如说write在内核的具体实现，以及内核中任何的代码，也必须小心并安全的写好。所以，即使从用户空间到内核空间的切换十分安全，整个内核的其他部分也必须非常安全，并时刻小心用户代码可能会尝试欺骗它。**

---

**supervisor mode可以做什么？**

+ **在前面介绍的寄存器中，有一个特殊的寄存器我想讨论一下，也就是mode标志位。**

这里的mode表明当前是user mode还是supervisor mode。

当我们在用户空间时，这个标志位是user mode，当我们在内核空间时，这个标志位是 supervisor mode。

+ **有一点很重要：当这个标志位从user mode变更到supervisor mode时，我们能得到什么样的权限。**

实际上，这里获得的额外权限实在是有限。也就是说，你可以在supervisor mode完成，但是不能在user mode完成的工作，或许并没有你想象的那么有特权。所以，我们接下来看看supervisor mode可以控制什么？

1. **你现在可以读写控制寄存器了。**

比如说，当你在supervisor mode时，

你可以读写：

+ SATP寄存器，也就是page table的指针；
+ STVEC，也就是处理trap的内核指令地址；
+ SEPC，保存当发生trap时的程序计数器；
+ SSCRATCH等等。

**在supervisor mode你可以读写这些寄存器，而用户代码不能做这样的操作。**

2. **另一件事情supervisor mode可以做的是，它可以使用PTE_U标志位为0的PTE。**

**当PTE_U标志位为1的时候，表明用户代码可以使用这个页表；如果这个标志位为0，则只有supervisor mode可以使用这个页表。我们接下来会看一下为什么这很重要。**

3. **<font style="background-color:#FBDE28;">需要特别指出的是，supervisor mode中的代码并不能读写任意物理地址。</font>**

在supervisor mode中，就像普通的用户代码一样，也需要通过page table来访问内存。如果一个虚拟地址并不在当前由SATP指向的page table中，又或者SATP指向的page table中PTE_U=1，那么supervisor mode不能使用那个地址。所以，即使我们在supervisor mode，我们还是受限于当前page table设置的虚拟地址。

**接下来我们会看一下，当我们进入到内核空间时，trap代码的执行流程。**

## 6.2 Trap代码总体执行流程

先简单介绍一下trap代码的执行流程，但是这节课大部分时间都会通过gdb来跟踪代码是如何通过trap进入到内核空间，这里会涉及到很多的细节。

我们会跟踪如何在Shell中调用write系统调用。

从Shell的角度来说，这就是个Shell代码中的C函数调用，

**<font style="background-color:#FBDE28;">但是实际上，write通过执行ECALL指令来执行系统调用。ECALL指令会切换到具有supervisor mode的内核中。</font>**

**在这个过程中**

1. **内核中执行的第一个指令是一个由汇编语言写的函数，叫做uservec。这个函数是内核代码trampoline.s文件的一部分。所以执行的第一个代码就是这个uservec汇编函数。**
2. **在这个汇编函数中，代码执行跳转到了由C语言实现的函数usertrap中，这个函数在trap.c中。**
3. **现在代码运行在C中，在usertrap这个C函数中，我们执行了一个叫做syscall的函数。**
4. **这个函数会在一个表单中，根据传入的代表系统调用的数字进行查找，并在内核中执行具体实现了系统调用功能的函数。对于我们来说，这个函数就是sys_write。**
5. **sys_write会将要显示数据输出到console上，当它完成了之后，它会返回给syscall函数。**
6. **因为我们现在相当于在ECALL之后中断了用户代码的执行，为了用户空间的代码恢复执行，需要做一系列的事情。在syscall函数中，会调用一个函数叫做usertrapret，它也位于trap.c中，这个函数完成了部分方便在C代码中实现的返回到用户空间的工作。**
7. **除此之外，最终还有一些工作只能在汇编语言中完成。这部分工作通过汇编语言实现，并且存在于trampoline.s文件中的userret函数中。**
8. **最终，在这个汇编函数中会调用机器指令返回到用户空间，并且恢复ECALL之后的用户程序的执行。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/6808be4f798aad630e54cfa286fe7bed.jpeg)

## 6.3 ECALL指令之前的状态
**<font style="background-color:#FBDE28;">我们将跟踪一个XV6的系统调用，也就是Shell将它的提示信息通过write系统调用走到操作系统再输出到console的过程。</font>**

**你们可以看到，用户代码sh.c初始了这一切。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/137746c2af12496083ed29a978ae853d.jpeg)

**上图中选中的行，是一个write系统调用，它将“$ ”写入到文件描述符2。接下来我将打开gdb并启动XV6。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/4d33213c4dba7b33af8eb543899af064.png)

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/4e2224fd5b136d7ff65fcd4e38dab8f7.jpeg)

**作为用户代码的Shell调用write时，实际上调用的是关联到Shell的一个库函数。**

**在usys.s 中你可以查看这个库函数的源代码**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/976a8c3d629960b16f4274b0d2460a6c.jpeg)

**上面这几行代码就是实际被调用的write函数的实现。**

+ **它首先将SYS_write加载到a7寄存器，SYS_write是常量16。这里告诉内核，我想要运行第16个系统调用—write。**
+ **之后这个函数中执行了ecall指令，从这里开始代码执行跳转到了内核。内核完成它的工作之后，代码执行会返回到用户空间，继续执行ecall之后的指令，也就是ret。**
+ **最后 ret 从write库函数返回到了Shell中。**

---

**下面开始具体的系统调用跟踪**

**<font style="background-color:#FBDE28;">为了展示这里的系统调用，在ecall指令处放置一个断点</font>****，为了能放置断点，我们需要知道ecall指令的地址，我们可以通过查看由XV6编译过程产生的sh.asm找出这个地址。sh.asm是带有指令地址的汇编代码（注，asm文件3.7有介绍）。我这里会在ecall指令处放置一个断点，这条指令的地址是0xde6。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/918c0ab2a8eabd5f62f2ef759d025d66.jpeg)

**开始运行**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/fb6478569280348b9ea057d0b130c0d3.jpeg)

**从gdb可以看出，我们下一条要执行的指令就是ecall。我们来检验一下我们是否真的在我们认为的位置**

**我们打印程序计数器（Program Counter），确实是我们期望的位置0xde6。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/2f122fe38e6ed242d088b7f3b6798cc3.jpeg)

**我们还可以输入**_**info reg**_**打印全部32个用户寄存器**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/b9d735c9c98052d42271e089aff65fa6.jpeg)

**这里有一些数值我们还不知道是什么，我们也不关心。**

**但是这里的a0，a1，a2是Shell传递给write系统调用的参数。**

+ **a0是文件描述符2**
+ **a1是Shell想要写入字符串的指针**
+ **a2是想要写入的字符数**

**<font style="background-color:#FBDE28;">有一件事情需要注意，上图的寄存器中，程序计数器（pc）和堆栈指针（sp）的地址现在都在距离0比较近的地址，这进一步印证了当前代码运行在用户空间，因为用户空间中所有的地址都比较小。但是一旦我们进入到了内核，内核会使用大得多的内存地址。</font>**

**在进行系统调用时，会发生许多重要的状态变更，其中最关键的是当前的页表（page table）。在变更页表之前，我们依赖它来维护内存管理的正确性。我们可以通过查看STAP寄存器来观察页表的状态。  **

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/a2da09e9cfa460ee585cd4903ff11d9c.jpeg)

**这里输出的只是页表的物理内存地址，它并没有告诉我们有关page table中的映射关系。**

**但幸运的是，在QEMU中有一个方法可以打印当前的page table。**

**从QEMU界面，输入**_**ctrl a + c**_**可以进入到QEMU的console，之后输入**_**info mem**_**，QEMU会打印完整的page table。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/a51c25b83fa5916058ae0453ec2f3c0b.jpeg)

**这是个非常小的page table，它只包含了6条映射关系。这是用户程序Shell的page table，而Shell是一个非常小的程序，这6条映射关系是有关Shell的指令和数据，以及一个无效的page用来作为guard page，以防止Shell尝试使用过多的stack page。**

+ 我们可以看出第三行这个page是无效的，因为在attr这一列它并没有设置u标志位。attr这一列是PTE的标志位，第三行的标志位是rwx表明这个page可以读，可以写，也可以执行指令；之后的是u标志位，它表明PTE_u标志位是否被设置，用户代码只能访问u标志位设置了的PTE。再下一个标志位是Global，再下一个标志位是a（Accessed），表明这条PTE是不是被使用过。再下一个标志位d（Dirty）表明这条PTE是不是被写过。

**<font style="background-color:#FBDE28;">现在，我们有了这个很小的page table。我们也可以看到最后两条PTE的虚拟地址非常大，非常接近虚拟地址的顶端。</font>**

**<font style="background-color:#FBDE28;">这两个page分别是trapframe page和trampoline page</font>****。**

**<font style="background-color:#FBDE28;">你可以看到，它们都没有设置u标志，所以用户代码不能访问这两条PTE。只有当我们进入到了supervisor mode，我们才可以访问这两条PTE。</font>**

**对于这里page table，有一件事情需要注意：它并没有包含任何内核部分的地址映射，这里既没有对于kernel data的映射，也没有对于kernel指令的映射。除了最后两条PTE，这个page table几乎是完全为用户代码执行而创建，所以它对于在内核执行代码并没有直接特殊的作用。**

**接下来，我会在Shell中打印出write函数的内容。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/29a6e09de5500e16feaf0b3419caae6a.jpeg)

## 6.4 ECALL指令之后的状态
+ **<font style="background-color:#FBDE28;">执行ecall指令 </font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/a5d5d1fd23969c898a0eb4f756b914a9.jpeg)

---

+ **第一个问题，执行完了ecall之后我们现在在哪？**

**通过打印程序计数器（Program Counter）查看。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/034ff92e7a5787d48bb284b62d2aaaa3.jpeg)

**可以看到程序计数器的值发生了变化，之前程序计数器(PC)还在一个很小的地址0xde6，但现在是一个大得多的地址。**

**同时我们查看page table，通过在QEMU中执行info mem来查看当前的page table。**

**可以看出，这还是与之前完全相同的page table，所以page table没有改变。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/2b04e48fcd0cb0503a8c0eb2f35c2ae2.jpeg)

---

**根据现在的程序计数器（PC），代码正在trampoline page（蹦床内存页）的最开始，这是用户进程内存中非常大的地址。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/f4499e88e7309478c74b65c664e80e37.png)

**所以现在我们的指令正运行在内存的trampoline page中。我们可以来查看一下现在将要运行的指令。**![](https://raw.githubusercontent.com/ScuDays/MyImg/master/56091c7708f9c806aa82d7c2ae39bd7d.jpeg)

**这些指令是内核在supervisor mode中将要执行的最开始的几条指令，也是在trap机制中最开始要执行的几条指令。**

---

> **因为gdb有一些奇怪的行为，我们实际上已经执行了位于trampoline page 的第一条指令（注，也就是csrrw指令）**
>
> **我们将要执行的是第二条指令。**
>

**我们可以查看寄存器，对比6.3中的图可以看出，寄存器的值并没有改变，这里还是用户程序拥有的一些寄存器内容。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/0f7a0d95e6a4fa8c9e0010364286bcf7.jpeg)

**所以，现在寄存器里面还都是用户程序的数据，并且这些数据也还只保存在这些寄存器中，所以我们需要非常小心。**

**<u>在将寄存器数据保存在某处之前，如果内核使用了任何一个寄存器，内核会覆盖寄存器内的用户数据，之后如果我们尝试要恢复用户程序，我们就无法恢复寄存器中原本的数据，用户程序的执行也会相应的出错。</u>**

---

> **学生提问：我想知道csrrw指令是干什么的？**
>
> **Robert教授：我们过几分钟会讨论这部分。但是对于你的问题的答案是 SEPC  ，这条指令交换了寄存器a0和sscratch的内容。这个操作超级重要，它回答了这个问题，内核的trap代码如何能够在不使用任何寄存器的前提下做任何操作。这条指令将a0的数据保存在了sscratch中，同时又将sscratch内的数据保存在a0中。之后内核就可以任意的使用a0寄存器了。**
>

**我们现在在哪？**

+ **我们已经执行完了 **_**ECALL（一个 架构内定义的机器指令）**_
+ **我们现在在这个地址 0x3ffffff000，也就是上面page table输出的最后一个 page--trampoline page。**
+ **我们现在正在 trampoline page 中执行程序，这个 page 包含了内核的 trap 处理代码。**

**<font style="background-color:#FBDE28;">ecall并不会切换page table，这是ecall指令的一个非常重要的特点。所以这意味着，trap处理代码必须存在于每一个user page table中。</font>**

**<font style="background-color:#FBDE28;">因为ecall并不会切换page table，我们需要在user page table中的某个地方来执行最初的内核代码。</font>**

**<font style="background-color:#FBDE28;">而这个trampoline page，是由内核小心的映射到每一个user page table中，以使得当我们仍然在使用user page table时，内核在一个地方能够执行trap机制的最开始的一些指令。</font>**

**这里的控制是通过STVEC寄存器完成的，这是一个只能在supervisor mode下读写的特权寄存器。**

**在从内核空间进入到用户空间之前，内核会设置STVEC寄存器指向内核希望trap代码运行的位置-也就是****trampoline page的起始位置**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/383c94a904908e60353e1b16d6f7cd0a.jpeg)

---

**所以如你所见，**

+ **内核已经事先设置好了STVEC寄存器的内容为0x3ffffff000，这就是trampoline page的起始位置。**
+ **在ecall指令执行之后，我们根据 STVEC 寄存器的内容在这个特定地址执行指令。**
+ **即使trampoline page是在用户地址空间的user page table完成的映射，用户代码不能写它，因为这些page对应的PTE并没有设置PTE_u标志位。这也是为什么trap机制是安全的。**

**我一直在告诉你们我们现在已经在supervisor mode了，但是实际上我并没有任何能直接确认当前在哪种mode下的方法。**

**不过我们的确发现程序计数器现在正在trampoline page执行代码，而这些page对应的PTE并没有设置PTE_u标志位。**

**所以现在只有当代码在supervisor mode时，才可能在程序运行的同时而不崩溃。所以，我从代码没有崩溃和程序计数器的值推导出我们必然在supervisor mode。**

> **学生提问：为什么我们在gdb中看不到ecall的具体内容？或许我错过了，但是我觉得我们是直接跳到trampoline代码的。**
>
> **自己查资料：****<font style="background-color:#FBDE28;">实际上ecall是CPU的指令，RISC-V 芯片定义的，自然在gdb中看不到具体内容</font>**
>
> **Robert教授：ecall只会更新CPU中的mode标志位为supervisor，并且设置程序计数器成STVEC寄存器内的值。在进入到用户空间之前，内核会将trampoline page的地址存在STVEC寄存器中。所以ecall的下一条指令的位置是STVEC指向的地址，也就是trampoline page的起始地址。**
>

+ **ECALL 到底做了什么？**

**我们是通过ecall走到trampoline page的，而ecall实际上只会改变三件事情：**

**（ecall 实际上执行了一系列的机器指令，我们无法看到它的代码）**

+ **<font style="background-color:#FBDE28;">第一，ecall将代码从user mode改到supervisor mode。</font>**

---

+ **<font style="background-color:#FBDE28;">第二，ecall将程序计数器的值保存在了SEPC寄存器。（必须在这里就保存好 PC 的值，</font>**
+ **<font style="background-color:#FBDE28;">ecall 之后 PC 中的值为指向 trampoline page 中的代码）</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/81af6be5d73176039089240e9d599e56.jpeg)

**尽管其他的寄存器还是还是用户寄存器，但是这里的程序计数器明显已经不是用户代码的程序计数器。这里的程序计数器是从STVEC寄存器拷贝过来的值。**

**我们可以打印SEPC（Supervisor Exception Program Counter）寄存器，这是ecall保存用户程序计数器的地方。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/002d97166ce36e365cb234eada06332e.jpeg)

**这个寄存器里面有熟悉的地址0xde6，这是ecall指令在用户空间的地址。所以ecall至少保存了程序计数器的数值。**

---

+ **<font style="background-color:#FBDE28;">第三，ecall会跳转到STVEC寄存器指向的指令。</font>**

**那么接下来我们还需要做什么才能执行系统调用具体的代码呢？**

**<font style="background-color:#FBDE28;">ecall帮我们做了一点点工作，但是实际上我们离执行内核中的C代码还差的很远。接下来：</font>**

+ **<font style="background-color:#FBDE28;">我们需要保存32个用户寄存器的内容，这样当我们想要恢复用户代码执行时，我们才能恢复这些寄存器的内容。</font>**
+ **<font style="background-color:#FBDE28;">因为现在我们还在user page table，我们需要切换到kernel page table。</font>**
+ **<font style="background-color:#FBDE28;">我们需要创建或者找到一个kernel stack，并将Stack Pointer寄存器的内容指向那个kernel stack。这样才能给C代码提供栈。</font>**
+ **<font style="background-color:#FBDE28;">我们还需要跳转到内核中C代码的某些合理的位置。</font>**

**ecall并不会为我们做这里的任何一件事。**

当然，我们可以通过修改硬件让ecall为我们完成这些工作，而不是交给软件来完成。

并且，在软件中完成这些工作并不是特别简单。

**所以你会问，**

+ 为什么ecall不多做点工作来将代码执行从用户空间切换到内核空间呢？
+ 为什么ecall不会保存用户寄存器，或者切换page table指针来指向kernel page table，或者自动的设置Stack Pointer指向kernel stack，或者直接跳转到kernel的C代码，而不是在这里运行复杂的汇编代码？

**回答：**

+ 实际上，有的机器在执行系统调用时，会在硬件中完成所有这些工作。但是RISC-V并不会，RISC-V秉持了这样一个观点：**ecall只完成尽量少必须要完成的工作，其他的工作都交给软件完成。这里的原因是，RISC-V设计者想要为软件和操作系统的程序员提供最大的灵活性，这样他们就能按照他们想要的方式开发操作系统**。所以你可以这样想，尽管XV6并没有使用这里提供的灵活性，但是一些其他的操作系统用到了。

**举个例子，**

1. **因为这里的ecall是如此的简单，或许某些操作系统可以在不切换page table的前提下，执行部分系统调用。切换page table的代价比较高，如果ecall打包完成了这部分工作，那就不能对一些系统调用进行改进，使其不用在不必要的场景切换page table。**
2. **某些操作系统同时将user和kernel的虚拟地址映射到一个page table中，这样在user和kernel之间切换时根本就不用切换page table。对于这样的操作系统来说，如果ecall切换了page table那将会是一种浪费，并且也减慢了程序的运行。或许在一些系统调用过程中，一些寄存器不用保存，而哪些寄存器需要保存，哪些不需要，取决于于软件，编程语言，和编译器。通过不保存所有的32个寄存器或许可以节省大量的程序运行时间，所以你不会想要ecall迫使你保存所有的寄存器。**
3. **最后，对于某些简单的系统调用或许根本就不需要任何stack，所以对于一些非常关注性能的操作系统，ecall不会自动为你完成stack切换是极好的。**

**所以，ecall尽量的简单可以提升软件设计的灵活性。**

## 6.5 uservec函数-trampoline 代码（保存寄存器，设置环境，进入内核）
**现在程序位于 trampoline 中，我们通过 uservec() 从用户空间切换到内核空间**
```c
.globl trampoline
trampoline:
.align 4
    .globl uservec
uservec:    
#
# trap.c sets stvec to point here, so
# traps from user space start here,
# in supervisor mode, but with a
# user page table.
#
# sscratch points to where the process's p->trapframe is
# mapped into user space, at TRAPFRAME.
#

# swap a0 and sscratch
# so that a0 is TRAPFRAME
csrrw a0, sscratch, a0

  # save the user registers in TRAPFRAME
  sd ra, 40(a0)
    sd sp, 48(a0)
    sd gp, 56(a0)
    sd tp, 64(a0)
    sd t0, 72(a0)
    sd t1, 80(a0)
    sd t2, 88(a0)
    sd s0, 96(a0)
    sd s1, 104(a0)
    sd a1, 120(a0)
    sd a2, 128(a0)
    sd a3, 136(a0)
    sd a4, 144(a0)
    sd a5, 152(a0)
    sd a6, 160(a0)
    sd a7, 168(a0)
    sd s2, 176(a0)
    sd s3, 184(a0)
    sd s4, 192(a0)
    sd s5, 200(a0)
    sd s6, 208(a0)
    sd s7, 216(a0)
    sd s8, 224(a0)
    sd s9, 232(a0)
    sd s10, 240(a0)
    sd s11, 248(a0)
    sd t3, 256(a0)
    sd t4, 264(a0)
    sd t5, 272(a0)
    sd t6, 280(a0)

    # save the user a0 in p->trapframe->a0
    csrr t0, sscratch
  sd t0, 112(a0)

    # restore kernel stack pointer from p->trapframe->kernel_sp
    ld sp, 8(a0)

    # make tp hold the current hartid, from p->trapframe->kernel_hartid
    ld tp, 32(a0)           

    # load the address of usertrap(), p->trapframe->kernel_trap
    ld t0, 16(a0)

    # restore kernel page table from p->trapframe->kernel_satp
    ld t1, 0(a0)
    csrw satp, t1
  sfence.vma zero, zero

  # a0 is no longer valid, since the kernel page
  # table does not specially map p->tf.

    # jump to usertrap(), which does not return
    jr t0
```
**我们现在需要做的第一件事情是保存寄存器的内容。**

+ **在RISC-V上，如果不能使用寄存器，基本上不能做任何事情。**
+ **所以，我们要如何保存这些寄存器呢？**
+ **我们需要一些空闲的寄存器，并且需要 kernel page table 的地址，存储在寄存器中，再执行修改SATP寄存器的指令。**

---

1. 在一些其他的机器中，我们可以**直接将32个寄存器中的内容写到物理内存中某些位置**。
2. 但是我们不能在RISC-V中这样做，因为在RISC-V中，**supervisor mode下的代码****<font style="background-color:#FBDE28;">也不允许直接访问物理内存</font>**。所以我们**只能使用page table中的内容，但从前面 ecall 前后的页表是相同的可以看出 page table中并没有存储这 32 个寄存器**。
3. **<font style="background-color:#FBDE28;">另一种可能的操作是，直接将SATP寄存器指向kernel page table，之后我们就可以直接将用户寄存器存储在 kernel mapping 中。</font>**

**这是合理的，在 supervisor mode 我们可以更改SATP寄存器。**

**但有几个问题：**

1. 在trap代码现在的位置，trap机制的最开始，我们并不知道 kernel page table 的地址是多少。
2. 同时更改SATP寄存器的指令，要求写入SATP寄存器的内容来自于另一个寄存器。

**为了能执行更新page table的指令，我们需要一些空闲的寄存器，并且需要 kernel page table 的地址，存储在寄存器中，再执行修改SATP寄存器的指令。**

---

**对于上面保存用户寄存器的问题，XV6在RISC-V上的实现包括了两个部分。**

+ **第一部分**
    - **XV6在每个user page table映射了trapframe page，每个进程都有自己的trapframe page。**
    - **在每个进程的 trapframe page 中，我们有一个由 kernel 提前设置好的映射关系，这个映射关系指向了一个可以存放这个进程的 32 个用户寄存器的内存位置。这个位置的虚拟地址总是0x3ffffffe000。**

**如果你想查看XV6在trapframe page中存放了什么，这部分代码在proc.h中的trapframe结构体中。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/225f99a9012a265ddc947c5fa6995952.jpeg)

    - **你可以看到大部分槽位的名字都对应了特定的寄存器。**
    - **<font style="background-color:#FBDE28;">在最开始有5个数据，这些是内核事先存放在trapframe中的数据。</font>**
    - **比如第一个数据保存了kernel page table地址，这将会是trap处理代码将要加载到SATP寄存器的数值。**

**<font style="background-color:#FBDE28;">如何保存用户寄存器的一半答案是，内核将 trapframe page 映射到了每个user page table 中</font>**

---

+ **第二部分**
+ **第一步：保存 32 个寄存器**
    - **我们之前提过的由RISC-V提供的 SSCRATCH寄存器。就是为接下来的目的而创建的。**
    - **在进入到 user space 之前，内核会将 trapframe page 的地址保存在这个寄存器中，也就是0x3fffffe000 这个地址。**
    - **更重要的是，RISC-V 有一个指令允许交换任意两个寄存器的值。而SSCRATCH寄存器的作用就是保存另一个寄存器的值，并将自己的值加载给另一个寄存器。**
+ **如果我查看trampoline.S代码**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/d26149d201ae836fa8c82537ffac4207.jpeg)

**第一件事情就是执行csrrw指令，这个指令交换了a0和sscratch两个寄存器的内容。为了看这里的实际效果，我们来打印a0，**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/1f67f4a1a932e3485828ee4e07788cb2.jpeg)

**现在 a0 的值是0x3fffffe000，这是 trapframe page 的 virtual address。它之前保存在SSCRATCH寄存器中，但现在被交换到了a0中。我们也可以打印SSCRATCH寄存器，**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/680b2292de65074354ab50444da11988.jpeg)

**它现在的内容是2，这是a0寄存器之前的值。a0寄存器保存的是write函数的第一个参数，在这个场景下，是Shell传入的文件描述符2。**

+ **我们现在将a0的值保存起来了，并且有了指向trapframe page的指针。**
+ **现在我们正继续在保存用户寄存器的道路上前进。**
+ **实际上，这就是trampoline.S中接下来30多个奇怪指令的工作。**
+ **这些指令就是的执行sd，将每个寄存器保存在trapframe的不同偏移位置。**
+ **因为a0在交换完之后包含的是trapframe page地址，也就是0x3fffffe000。**
+ **所以，每个寄存器被保存在了偏移量+a0的位置。**

**最后， csrr 将 sscratch 的值存入 t0，将 t0 存入页面，sscratch 此时的值是 a0 原本的值，所以相当于存储 a0**

**寄存器拷贝到此结束。**

<details class="lake-collapse"><summary id="u32a705e9"><strong><span class="ne-text" style="font-size: 19px">学生提问（很有价值）</span></strong></summary><ul class="ne-ul"><li id="u5355e884" data-lake-index-type="0"><strong><span class="ne-text" style="font-size: 22px">trapframe的地址是怎么出现在SSCRATCH寄存器中的呢？</span></strong></li><li id="ua2485ecb" data-lake-index-type="0"><strong><span class="ne-text" style="font-size: 22px">内核通过调用 fn() 函数将 trapframe的地址保存在SSCRATCH寄存器中</span></strong></li></ul><p id="ucb667b98" class="ne-p" style="text-align: left"><strong><span class="ne-text" style="font-size: 22px">学生提问：</span></strong></p><p id="u3a65ced0" class="ne-p" style="text-align: left"><strong><span class="ne-text">当与a0寄存器进行交换时，trapframe的地址是怎么出现在SSCRATCH寄存器中的？</span></strong></p><p id="uc966e050" class="ne-p" style="text-align: left"><strong><span class="ne-text" style="font-size: 22px">Robert教授：</span></strong></p><p id="ufba48cb8" class="ne-p" style="text-align: left"><strong><span class="ne-text">在内核前一次切换回用户空间时，内核会执行set sscratch指令，将这个寄存器的内容设置为0x3fffffe000，也就是trapframe page的虚拟地址；所以，当我们在运行用户代码，比如运行Shell时，SSCRATCH保存的就是指向trapframe的地址。之后，Shell执行了ecall指令，跳转到了trampoline page，这个page中的第一条指令会交换a0和SSCRATCH寄存器的内容。所以，SSCRATCH中的值，也就是指向trapframe的指针现在存储与a0寄存器中。</span></strong></p><p id="u5a872097" class="ne-p" style="text-align: left"><strong><span class="ne-text" style="font-size: 22px">同一个学生提问：</span></strong></p><p id="u5efbc4b3" class="ne-p" style="text-align: left"><strong><span class="ne-text">这是发生在进程创建的过程中吗？这个SSCRATCH寄存器存在于哪？</span></strong></p><p id="u21d2bfef" class="ne-p" style="text-align: left"><strong><span class="ne-text" style="font-size: 22px">Robert教授：</span></strong></p><p id="ud29917b7" class="ne-p" style="text-align: left"><strong><span class="ne-text">这个寄存器存在于CPU上，这是CPU上的一个特殊寄存器。内核在什么时候设置的它呢？这有点复杂。它被设置的实际位置，我们可以看下图，</span></strong></p><p id="u6aee360e" class="ne-p" style="text-align: left"><img src="https://cdn.nlark.com/yuque/0/2024/jpeg/27925082/1723882563824-01f577eb-8f2b-4d41-9c88-c563e82a740b.jpeg" width="742" id="ph1So" class="ne-image"></p><p id="u84d3e5f7" class="ne-p" style="text-align: left"><strong><span class="ne-text">选中的代码是内核在返回到用户空间之前执行的最后两条指令。在内核返回到用户空间时，会恢复所有的用户寄存器。</span></strong></p><p id="u77f458d6" class="ne-p" style="text-align: left"><strong><span class="ne-text">之后会再次执行交换指令，csrrw。因为之前内核已经设置了a0保存的是trap frame地址，经过交换之后SSCRATCH仍然指向了trapframe page地址，而a0也恢复成了之前的数值。最后sret返回到了用户空间。</span></strong></p><p id="u26aff7b9" class="ne-p" style="text-align: left"><strong><span class="ne-text">你或许会好奇，a0是如何有trapframe page的地址。我们可以查看trap.c代码，</span></strong></p><p id="u0a1d712c" class="ne-p" style="text-align: left"><img src="https://cdn.nlark.com/yuque/0/2024/jpeg/27925082/1723882573343-31464bb2-8efe-451f-827f-75570bdd4bd6.jpeg" width="734" id="YplJH" class="ne-image"></p><p id="u6bd6209f" class="ne-p" style="text-align: left"><strong><span class="ne-text">这是内核返回到用户空间的最后的C函数。</span></strong></p><p id="ue4f947bc" class="ne-p" style="text-align: left"><strong><span class="ne-text">C函数做的最后一件事情是调用fn函数，传递的参数是指向trapframe的指针和user page table。在C代码中，当你调用函数，第一个参数会存在a0，这就是为什么a0里面的数值是指向trapframe的指针。fn函数是就是刚刚我向你展示的位于trampoline.S中的代码。</span></strong></p><hr id="IXaFG" class="ne-hr"><ul class="ne-ul"><li id="u687b6085" data-lake-index-type="0"><strong><span class="ne-text" style="font-size: 22px"> 第一次 fn() 函数是在哪里被调用呢？</span></strong></li></ul><p id="u5e09e132" class="ne-p" style="text-align: left"><strong><span class="ne-text" style="background-color: #FBDE28; font-size: 24px">学生提问：</span></strong></p><p id="uf39e8821" class="ne-p" style="text-align: left"><strong><span class="ne-text" style="background-color: #FBDE28">当你启动一个进程，之后进程在运行，之后在某个时间点进程执行了ecall指令，那么你是在什么时候执行上一个问题中的fn函数呢？因为这是进程的第一个ecall指令，所以这个进程之前应该没有调用过fn函数吧。</span></strong></p><p id="ubcc8ef4e" class="ne-p" style="text-align: left"><strong><span class="ne-text" style="background-color: #FBDE28; font-size: 24px">Robert教授：</span></strong></p><p id="u9a9ae9c9" class="ne-p" style="text-align: left"><strong><span class="ne-text" style="background-color: #FBDE28">好的，或许对于这个问题的一个答案是：一台机器总是从内核开始运行的，当机器启动的时候，它就是在内核中。 任何时候，不管是进程第一次启动还是从一个系统调用返回，进入到用户空间的唯一方法是就是执行sret指令。sret指令是由RISC-V定义的用来从supervisor mode转换到user mode。所以，在任何用户代码执行之前，内核会执行fn函数，并设置好所有的东西，例如 SSCRATCH，STVEC寄存器。</span></strong></p><p id="u75cda755" class="ne-p" style="text-align: left"><strong><span class="ne-text" style="font-size: 22px">学生提问：</span></strong></p><p id="u9a489f0d" class="ne-p" style="text-align: left"><strong><span class="ne-text">当我们在汇编代码中执行ecall指令，是什么触发了trampoline代码的执行，是CPU中的从user到supervisor的标志位切换吗？</span></strong></p><p id="u06c3dd02" class="ne-p" style="text-align: left"><strong><span class="ne-text" style="font-size: 22px">Robert教授：</span></strong></p><p id="udd894f75" class="ne-p" style="text-align: left"><strong><span class="ne-text">在我们的例子中，Shell在用户空间执行了ecall指令。ecall会完成几件事情，ecall指令会设置当前为supervisor mode，保存程序计数器到SEPC寄存器，并且将程序计数器设置成控制寄存器STVEC的内容。STVEC是内核在进入到用户空间之前设置好的众多数据之一，内核将 STVEC 设置成 trampoline page 的起始位置。所以，当ecall指令执行时，ecall会将STVEC拷贝到程序计数器。之后程序继续执行，但是却会在当前程序计数器所指的地址，也就是trampoline page的起始地址执行。</span></strong></p><hr id="j5zbi" class="ne-hr"><ul class="ne-ul"><li id="u0a23657e" data-lake-index-type="0"><strong><span class="ne-text" style="font-size: 24px">为什么要使用内存中一个新的区域（trapframe page），而不是使用程序的栈？</span></strong></li></ul><p id="u2cf537e3" class="ne-p" style="text-align: left"><strong><span class="ne-text" style="font-size: 22px">学生提问：</span></strong></p><p id="uc5ee537a" class="ne-p" style="text-align: left"><strong><span class="ne-text">寄存器保存在了trapframe page，但是这些寄存器用户程序也能访问，为什么我们要使用内存中一个新的区域（指的是trapframe page），而不是使用程序的栈？</span></strong></p><p id="uacec9c83" class="ne-p" style="text-align: left"><strong><span class="ne-text" style="font-size: 22px">Robert教授：</span></strong></p><p id="u33c1cf59" class="ne-p" style="text-align: left"><strong><span class="ne-text">好的，这里或许有两个问题。</span></strong></p><ol class="ne-ol"><li id="u6a318b4b" data-lake-index-type="0" style="text-align: left"><strong><span class="ne-text">第一个问题，为什么我们要保存寄存器？</span></strong></li></ol><p id="u3f51b98f" class="ne-p" style="text-align: left"><span class="ne-text" style="font-size: 15px">内核要保存寄存器的原因，是因为内核即将要运行会覆盖这些寄存器的C代码。如果我们想正确的恢复用户程序，我们需要将这些寄存器恢复成它们在ecall调用之前的数值，所以我们需要将所有的寄存器都保存在trapframe中，这样才能在之后恢复寄存器的值。</span></p><ol start="2" class="ne-ol"><li id="ud56a71d4" data-lake-index-type="0" style="text-align: left"><strong><span class="ne-text">第二个问题，为什么这些寄存器保存在trapframe，而不是用户代码的栈中？</span></strong></li></ol><p id="u8e25eaec" class="ne-p" style="text-align: left"><strong><span class="ne-text" style="font-size: 14px">这个问题的答案是：</span></strong></p><ul class="ne-ul"><li id="ue35e1ea6" data-lake-index-type="0" style="text-align: left"><strong><span class="ne-text" style="font-size: 14px">我们不确定用户程序是否有栈</span></strong><span class="ne-text" style="font-size: 14px">，有一些编程语言没有栈。</span></li><li id="u578906a0" data-lake-index-type="0" style="text-align: left"><strong><span class="ne-text" style="font-size: 14px">也有一些编程语言有栈，但是它的格式很奇怪，内核并不能理解</span></strong><span class="ne-text" style="font-size: 14px">。比如，编程语言以堆中以小块来分配栈，编程语言的运行时知道如何使用这些小块的内存来作为栈，但是内核并不知道。</span></li><li id="u52c41c93" data-lake-index-type="0" style="text-align: left"><span class="ne-text" style="font-size: 14px">所以，</span><strong><span class="ne-text" style="font-size: 14px">如果我们想要运行任意编程语言实现的用户程序，内核就不能假设用户内存的哪部分可以访问，哪部分有效，哪部分存在。</span></strong></li><li id="u6b45b4fd" data-lake-index-type="0" style="text-align: left"><strong><span class="ne-text" style="font-size: 14px">所以内核需要自己管理这些寄存器的保存，这就是为什么内核将这些内容保存在属于内核内存的trapframe中，而不是用户内存。</span></strong></li></ul></details>
+ **第二部分**
+ **第二步：使用内核提前设置好的数据，进入内核空间**

**我们在寄存器拷贝的结束位置设置了一个断点，在gdb中让代码继续执行**

1. **<font style="background-color:#FBDE28;">现在我们执行下面这条ld（load）指令，加载内核栈。</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/318f6a93de2bbe1d815bea163d5e638f.jpeg)![](https://raw.githubusercontent.com/ScuDays/MyImg/master/225f99a9012a265ddc947c5fa6995952.jpeg)

+ 现在 a0 的值是 trapframe page 的地址
+ **ld 这条指令将a0指向的内存地址往后数8个字节开始的数据加载到Stack Pointer寄存器。所以我们知道当前加载的数据是内核的栈 Stack Pointer(kernel_sp) 的值。**
+ **trapframe 中的 Stack Pointer(kernel_sp) 是由kernel在进入用户空间之前就设置好的，它的值指向了 kernel stack。**

**所以这条指令的作用是将 Stack Pointer 寄存器指向当前进程的 kernel stack 的最顶端。**

**我们打印一下当前的Stack Pointer寄存器，验证。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/9f671282615b2ca8f095aeb61a10381d.jpeg)

**目前 ****Stack Pointer 寄存器的值****确实是当前进程的 kernel stack。**

+ **kernel stack 之所以地址比较大。是因为XV6在需要在每个kernel stack下面放置一个guard page，且栈是从大地址到小地址增长，所以将 kernel stack 的位置安排到高位。**

---

2. **<font style="background-color:#FBDE28;">下一条指令是向 tp 寄存器写入CPU核的编号。</font>**

**在RISC-V中，没有直接的方法可以确认当前运行在多核处理器的哪个核上，XV6会将CPU核的编号也就是hartid保存在tp寄存器。在内核中好几个地方都会使用了这个值，例如，内核可以通过这个值确定某个CPU核上运行了哪些进程。我们执行这条指令，并且打印tp寄存器。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/2464da0a7e80afa0e4e700333d063599.png)

我们现在运行在CPU核0，这很合理，因为我之前配置了QEMU只给XV6分配一个核，所以我们只能运行在核0上。

---

3. **下一条指令是向t0寄存器写入数据。这里写入的是我们将要执行的第一个C函数的指针，也就是 usertrap() 的指针。**

**在后面我们将会使用该寄存器，通过** _**<font style="background-color:#FBDE28;">jr t0</font>**__** **_**进入 ****usertrap() 。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/0dd368cea4d84c1a5afa14f6843ee5a8.jpeg)

---

4. **<font style="background-color:#FBDE28;">下一条指令是向t1寄存器写入数据。</font>****这里写入的是 kernel page table 的地址，我们可以打印t1寄存器的内容。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/c4d26db4d749c3951552284a667b9d9f.jpeg)

实际上严格来说，t1的内容并不是kernel page table的地址，这是你需要向SATP寄存器写入的数据。它包含了kernel page table的地址，但是移位了（注，详见4.3），并且包含了各种标志位。

---

5. **<font style="background-color:#FBDE28;">下一条指令是交换SATP和t1寄存器。</font>****这条指令执行完成之后，当前程序会从 user page table 切换到 kernel page table。现在我们在QEMU中打印 page table，可以看出与之前的page table完全不一样，已经切换成了内核页表。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/bf71e6dc068b4bd09a35cbc57deffaec.jpeg)

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/8258b336dff00416fd9ddaea1d57645b.jpeg)

**现在这里输出的是由内核设置好的巨大的kernel page table。所以现在我们成功的切换了page table，我们在这个位置进展的很好，Stack Pointer指向了kernel stack；我们有了kernel page table，可以读取kernel data。我们已经准备好了执行内核中的C代码了。**

+ **这里还有个问题，为什么代码没有崩溃？毕竟我们在内存中的某个位置执行代码，程序计数器保存的是虚拟地址，如果我们切换了page table，为什么同一个虚拟地址不会通过新的page table寻址走到一些无关的page中？看起来我们现在没有崩溃并且还在执行这些指令。有人来猜一下原因吗？**
    - **学生回答：因为我们还在trampoline代码中，而trampoline代码在用户空间和内核空间都映射到了同一个地址。**
+ **完全正确。trampoline page在user page table中的映射与kernel page table中的映射是完全一样的。这两个page table中其他所有的映射都是不同的，只有trampoline page的映射是一样的，因此我们在切换page table时，寻址的结果不会改变，就可以继续在同一个代码序列中执行程序而不崩溃。之所以叫trampoline page，是因为你某种程度在它上面“弹跳”了一下，然后从用户空间走到了内核空间。**

---

6. **<font style="background-color:#FBDE28;">最后一条指令是</font>**_**<font style="background-color:#FBDE28;">jr t0</font>**_**。执行这条指令后，我们就从 trampoline 跳到内核的C代码中。这条指令的作用是跳转到t0指向的函数中。我们打印 t0 之后的指令**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/fdc57c91efe997bd9fe1b9cab24d8430.jpeg)

**可以看到t0的位置对应于一个叫做usertrap函数的开始。接下来我们就要以栈为 kernel stack，页表为 kernel page table 跳转到usertrap函数。**

## 6.6 usertrap()-保存部分内容并处理中断
<details class="lake-collapse"><summary id="ua173bcdd"><strong><span class="ne-text" style="font-size: 19px">usertrap函数代码</span></strong></summary><p id="u19d858ca" class="ne-p"><strong><span class="ne-text" style="font-size: 19px">usertrap函数是位于trap.c文件的一个函数。</span></strong></p><p id="u30af9a55" class="ne-p"><img src="https://cdn.nlark.com/yuque/0/2024/jpeg/27925082/1723971000257-c1266957-6488-4800-92a3-d2fb32cdc748.jpeg" width="478" id="ufhwU" class="ne-image"></p></details>
有很多原因都可以让程序运行进入到usertrap函数中来，比如系统调用，运算时除以0，使用了一个未被映射的虚拟地址，或者是设备中断。

+ **<font style="background-color:#FBDE28;">所以 usertrap某种程度上存储并恢复硬件状态，同时它也需要检查触发trap的原因，以确定相应的处理方式。</font>**

我们在接下来执行usertrap的过程中会同时看到这两个行为。

接下来，让我们一步步执行usertrap函数。

---

1. **usertrap 函数所做的第一件事情是更改STVEC寄存器，指向了kernelvec变量，这是内核空间trap处理代码的位置，而不是用户空间中的。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/1a090533d20cfad50ea43d08ddd44eba.jpeg)

（ 注释说明了代码的意图：既然已经在内核中了，所有后续的中断和异常都应该发送到 `kerneltrap()` 处理函数。`w_stvec` 是一个宏或函数，用来将 `stvec` 寄存器（保存中断入口地址的寄存器）设置为 `kernelvec`，即内核中断处理函数的地址。这确保了所有进一步的中断或异常都由内核代码处理。  ）

**这个函数的参数取决于trap是来自于用户空间还是内核空间， XV6处理不同 trap 的方法是不一样的。**

+ **目前为止，我们只讨论过当trap是由用户空间发起时会发生什么。**
+ **但如果trap从内核空间发起，处理流程将会非常不同。因为从内核发起的话，程序已经在使用kernel page table。所以当trap发生时，程序执行仍然在内核的话，很多处理都不必存在。**

**在内核中执行任何操作之前，usertrap中先将STVEC指向了kernelvec变量，这是内核空间trap处理代码的位置，而不是用户空间trap处理代码的位置。**

---

2. **出于各种原因，我们需要知道当前运行的是哪个进程，我们通过调用myproc函数来做到这一点。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/1ec0b4fe4e7ab5d19de91ab2f124d5ef.jpeg)

**myproc函数实际上会查找一个根据当前CPU核的编号索引的数组，CPU核的编号是hartid，我们之前在uservec函数中将它存在了tp寄存器中。这是myproc函数找出当前运行进程的方法。**

---

3. **接下来我们要保存用户程序计数器 (PC)**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/d9ebac62437f0da1debb8af80081120f.jpeg)

**<u>它仍然保存在SEPC寄存器中，但是可能发生这种情况：当程序还在内核中执行时，我们可能切换到另一个进程，并进入到那个程序的用户空间，然后那个进程可能再调用一个系统调用进而导致SEPC寄存器的内容被覆盖。</u>**

**所以，我们需要保存当前进程的SEPC寄存器到一个与该进程关联的内存中，这样这个数据才不会被覆盖。这里我们使用trapframe来保存这个程序计数器。**

> 学生提问(我也同样有疑问)：
>
> **为什么trampoline代码中不保存SEPC寄存器？**
>
> Robert教授：
>
> **可以存储。trampoline代码没有像其他寄存器一样保存这个寄存器，但是我们非常欢迎大家修改XV6来保存它。如果你还记得的话（详见6.6），这个寄存器实际上是在C代码usertrap中保存的，而不是在汇编代码trampoline中保存的。我想不出理由这里哪种方式更好。用户寄存器（User Registers）必须在汇编代码中保存，因为任何需要经过编译器的语言，例如C语言，都不能修改任何用户寄存器。所以对于用户寄存器，必须要在进入C代码之前在汇编代码中保存好。但是对于SEPC寄存器（注，控制寄存器），我们可以早点保存或者晚点保存。**
>

---

4. **接下来我们需要找出什么原因导致调用了 usertrap 函数。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/9f9ec5bf0d2b6309b6cde15d5317ae02.jpeg)

**对于不同触发trap的原因，RISC-V 的 SCAUSE 寄存器内会有不同的数字。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/54499f1e6e8c41e07ab10d6e6c02a847.jpeg)

**打印SCAUSE寄存器，它是数字8，所以可以确定我们是因为系统调用才走到这里的。**

---

5. **进入 if 判断，第一件事情是检查是不是有其他的进程杀掉了当前进程，我们的Shell没被杀掉，所以检查通过。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/c88e29252ee2d09af811c072d297a314.jpeg)

**<font style="background-color:#FBDE28;">在RISC-V中，存储在SEPC寄存器中的程序计数器的值，是用户程序最后触发 trap 指令的地址。</font>**

**<font style="background-color:#FBDE28;">当我们恢复用户程序时，我们希望在下一条指令恢复，也就是ecall之后的一条指令。</font>**

**<font style="background-color:#FBDE28;">所以对于系统调用，我们对保存的用户程序计数器加4，这样会在ecall的下一条指令恢复，而不是重新执行ecall指令。</font>**

> + **为什么加 4？**
>
> **因为在 RISC-V 架构中，大部分指令的长度是固定的 32 位，即 4 个字节。**
>

---

6. **接着启用中断**
+ **我们需要在调整完必要的寄存器后再启用中断。中断可能会改变 **`**sstatus**`** 寄存器和其他寄存器的状态，因此，在这些寄存器被安全地恢复或更新之前，不应该允许新的中断发生。  **
+ **XV6会在处理系统调用的时候使能中断，这样中断可以更快的服务，有些系统调用需要许多时间处理。中断总是会被RISC-V的trap硬件关闭，所以在这个时间点，我们需要显式的打开中断。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/8ef08e7f99a8fe3789b54632f8a6673a.jpeg)

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/109fe6629fe40d3d2528d0e408b5a077.jpeg)

---

7. **下一行代码中，我们会调用 syscall() 函数,真正执行系统调用，这个函数定义在syscall.c。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/a0cf6931a1e4a4a57b5b9a119c01f409.jpeg)

+ **syscall() 根据系统调用的编号查找相应的系统调用函数。**
+ **Shell 调用的 write 函数将寄存器 a7 设置成了系统调用编号，对于 write 来说就是16。**
+ **所以 syscall 函数的工作就是获取由 trampoline 代码保存在 trapframe 中 a7 的数字**
+ **然后根据数字从系统调用表单中索引进行调用。**

**我们打印 num，的确是16。这与Shell调用的write函数写入的数字是一致的。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/b1d73df08ff34f4f33d70b79f468ae47.jpeg)

+ **之后查看通过num索引得到的函数，正是sys_write函数。sys_write函数是内核对于write系统调用的具体实现。**
+ **对于系统调用的实现，我们只对进入和跳出内核感兴趣，不讨论具体sys_write 系统调用代码。这里我让代码直接执行sys_write函数。**
+ **系统调用需要找到它们的参数。write函数的参数分别是文件描述符2，写入数据缓存的指针，写入数据的长度2。**
+ **<font style="background-color:#FBDE28;">syscall函数直接通过trapframe来获取这些参数，就像这里刚刚可以查看trapframe中的a7寄存器一样，我们可以查看a0寄存器，这是第一个参数，a1是第二个参数，a2是第三个参数。</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/81596a719d5a48c66c514850d39e09d3.jpeg)

---

8. **现在syscall执行了真正的系统调用，之后sys_write返回，在 syscall 中我们会存储函数的返回值**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/12345cfba2873b811d6703fc050d3372.jpeg)

+ **存储函数的返回值**

**这里向trapframe中的a0赋值的原因是：**

1. **<font style="background-color:#FBDE28;">所有的系统调用都有一个返回值，比如write会返回实际写入的字节数，而 RISC-V 上的C代码的习惯是函数的返回值存储于寄存器a0，所以为了模拟函数的返回，我们将返回值存储在trapframe的a0中。</font>**
2. **<font style="background-color:#FBDE28;">之后，当我们返回到用户空间，trapframe中的a0槽位的数值会写到实际的a0寄存器，Shell会认为a0寄存器中的数值是write系统调用的返回值。执行完这一行代码之后，我们打印这里trapframe中a0的值，可以看到输出2。</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/d93b6d63b31ddd2e3d75c055d12524bf.jpeg)

**这意味这sys_write的返回值是2，符合传入的参数，这里只写入了2个字节。**

---

+ **最后，我们需要从****内核空间恢复到用户空间**

**从syscall函数返回之后，我们回到了trap.c中的usertrap函数。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/ef2fd88600114979d48559dfdcb7a83e.jpeg)

**我们再次检查当前用户进程是否被杀掉了，因为我们不想恢复一个被杀掉的进程。当然，在我们的场景中，Shell没有被杀掉。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/3a0a0ac3412a40b95f9a4dfe5b9e3e9e.jpeg)

**最后，usertrap调用了一个函数usertrapret。**

---

**现在，我们已经执行完了系统调用，接下来的任务就是从内核空间恢复到用户空间，这就是后面几个函数所要做的事情**

## 6.7 usertrapret()
> **讲解了操作系统中从内核空间到用户空间转换的**`**usertrapret**`**函数。这个函数负责在中断禁用的情况下更新STVEC寄存器，指向用户空间的陷阱处理代码。它还设置了内核的页表指针、内核栈和必要的陷阱帧细节，以准备返回到用户模式。最后，它通过设置SSTATUS寄存器并在转换后确保中断被启用，完成从内核到用户模式的过渡。  **
>

**usertrap() 最后调用了usertrapret() ，这个函数的目标是完成****从内核空间恢复到用户空间****之前内核要做的工作。**

---

1. **usertrapret() 首先关闭了中断。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/776180bfea37db393209192f641f2a5f.jpeg)

+ **我们之前在系统调用的过程中打开了中断**
+ **这里关闭中断是因为我们将要更新 STVEC 寄存器来指向用户空间的trap处理代码，**
+ **而之前在内核中的时候，我们指向的是内核空间的trap处理代码（6.6）。**

我们关闭中断因为当我们将STVEC更新到指向用户空间的trap处理代码时，我们仍然在内核中执行代码。

如果这时发生了一个中断，那么程序执行会走向用户空间的trap处理代码，即便我们现在仍然在内核中，出于各种各样具体细节的原因，这会导致内核出错。所以我们这里关闭中断。

---

2. **在下一行我们设置了STVEC寄存器指向trampoline代码**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/6b3910038ef19c8ed3419328f017d8b5.jpeg)

+ **在那里最终会执行sret指令返回到用户空间。**
+ **位于trampoline代码最后的sret指令会重新打开中断。**
+ **这样，即使我们刚刚关闭了中断，当我们在执行用户代码时中断是打开的。**

---

3. **接下来的几行填入了trapframe的内容，这些内容对于执行trampoline代码非常有用。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/facc5f179edf6c3da6839553e905d10e.jpeg)

**这里的代码：**

+ **存储 kernel page table的指针**
+ **存储当前用户进程的kernel stack**
+ **存储了 usertrap() 的指针，这样 trampoline 代码才能跳转到这个函数（注，详见6.5中 **_**ld t0 (16)a0 **_**指令）**
+ **从tp寄存器中读取当前的CPU核编号，并存储在trapframe中，这样trampoline代码才能恢复这个数字，因为用户代码可能会修改这个数字**

**现在我们在usertrapret函数中，我们正在设置trapframe中的数据，这样下一次从用户空间转换到内核空间时可以用到这些数据。**

---

4. **接下来我们要设置SSTATUS寄存器**
+ **<font style="background-color:#FBDE28;">这是一个控制寄存器。</font>****<font style="background-color:#FBDE28;">这个寄存器的SPP bit位控制了sret指令的行为，该bit为0表示下次执行sret的时候，我们想要回到 user mode 而不是 supervisor mode</font>****。**
+ **同时这个寄存器的SPIE bit位控制了，在执行完sret之后，是否打开中断。****我们在返回到用户空间之后，我们希望打开中断，所以这里将 SPIE bit位设置为1。修改完这些bit位之后，我们会把新的值写回到SSTATUS寄存器。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/b8d2a278ecffd189013e5a2f5d5fdf77.jpeg)

---

5. **设置SEPC寄存器的值设置成之前保存的用户程序计数器的值**
+ **之前 ecall 调用时，将 PC 存入 SEPC 中 **
+ **在 usertrap() 中我们 将 SEPC（也就是 PC 的值） 存入****到与该进程关联的内存中（为什么要存？前面笔记中有）**

**而现在我们执行完中断后，我们必须要恢复原本的 PC 地址，而 ****trampoline 代码中 就是执行从内核空间恢复到用户空间的。**

+ **userret() 的最后执行了 sret 指令。这条指令会将程序计数器设置成 SEPC 寄存器的值。**
+ **所以现在我们将 SEPC 寄存器的值设置成之前保存的用户程序计数器的值。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/1aa35dd4eac7b98504d4f58211e6f21a.jpeg)

---

6. **更改 SATP 为用户页表的值**
+ **接下来，我们根据 user page table 地址生成相应的SATP值，这样我们在返回到用户空间的时候才能完成page table的切换。实际上，我们会在汇编代码trampoline 中完成page table的切换，并且也只能在trampoline中完成切换，因为只有trampoline中代码是同时在用户和内核空间中映射。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/fa90cd18fa0f063c8e3cf6c58d777909.jpeg)

---

7. **跳转执行 userret()，进行内核空间到用户空间的转换**
+ **我们现在还没有在trampoline代码中，我们现在还在一个普通的C函数中，所以这里我们将page table指针准备好，并将这个指针作为第二个参数传递给汇编代码，这个参数会出现在a1寄存器。**
+ **倒数第二行的作用是****<font style="background-color:#FBDE28;">计算出我们将要跳转到汇编代码的地址。我们期望跳转的地址是tampoline中的userret函数，这个函数包含了所有能将我们带回到用户空间的指令。所以这里我们计算出了userret函数的地址。</font>****  （接下来跳转到）**
+ **倒数第一行，将fn指针作为一个函数指针，执行相应的函数（也就是userret函数）并传入两个参数，两个参数存储在a0，a1寄存器中。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/fa90cd18fa0f063c8e3cf6c58d777909.jpeg)

---

**接下来执行的是userret函数**

## 6.8 userret()
**现在又回到了 trampoline 代码，我们通过 userret() 从内核空间切换到用户空间。**

```c
.globl userret
userret:
        # userret(TRAPFRAME, pagetable)
        # switch from kernel to user.
        # usertrapret() calls here.
        # a0: TRAPFRAME, in user page table.
        # a1: user page table, for satp.

        # switch to the user page table.
        csrw satp, a1
        sfence.vma zero, zero

        # put the saved user a0 in sscratch, so we
        # can swap it with our a0 (TRAPFRAME) in the last step.
        ld t0, 112(a0)
        csrw sscratch, t0

        # restore all but a0 from TRAPFRAME
        ld ra, 40(a0)
        ld sp, 48(a0)
        ld gp, 56(a0)
        ld tp, 64(a0)
        ld t0, 72(a0)
        ld t1, 80(a0)
        ld t2, 88(a0)
        ld s0, 96(a0)
        ld s1, 104(a0)
        ld a1, 120(a0)
        ld a2, 128(a0)
        ld a3, 136(a0)
        ld a4, 144(a0)
        ld a5, 152(a0)
        ld a6, 160(a0)
        ld a7, 168(a0)
        ld s2, 176(a0)
        ld s3, 184(a0)
        ld s4, 192(a0)
        ld s5, 200(a0)
        ld s6, 208(a0)
        ld s7, 216(a0)
        ld s8, 224(a0)
        ld s9, 232(a0)
        ld s10, 240(a0)
        ld s11, 248(a0)
        ld t3, 256(a0)
        ld t4, 264(a0)
        ld t5, 272(a0)
        ld t6, 280(a0)

	# restore user a0, and save TRAPFRAME in sscratch
        csrrw a0, sscratch, a0
        
        # return to user mode and user pc.
        # usertrapret() set up sstatus and sepc.
        sret

```

1. **第一步是切换page table。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/05cf7068d68ca1b566727919d79ed86f.jpeg)

+ **在执行**_**csrw satp, a1 **_**之前，page table 应该还是巨大的kernel page table。**
+ **这条指令会将user page table（在usertrapret中作为第二个参数传递给了这里的userret函数，所以存在a1寄存器中）存储在SATP寄存器中。**
+ **执行完这条指令之后，page table就变成了小得多的user page table,**
+ **当切换页表，为什么系统没崩溃？**
+ **这是因为 user page table 也映射了trampoline page，所以程序还能继续执行而不是崩溃。（注，sfence.vma是清空页表缓存，详见4.4）。**

---

2. **将SSCRATCH寄存器恢复成保存好的用户的a0寄存器。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/e44d639dbc7b53a0a4477106c5da2c71.jpeg)

+ **在uservec函数中，第一件事情就是交换 SSRATCH 和 a0 寄存器。而这里，我们将 SSCRATCH 寄存器恢复成保存好的用户的 a0 寄存器。**
+ **在这里 a0 是 trapframe 的地址，因为C代码 usertrapret() 中将trapframe地址作为第一个参数传递过来了。112是a0寄存器在trapframe中的位置。**

**注：这里有点绕，本质就是通过当前的a0寄存器找出 trapframe, 再找出存放在 trapframe 中的原本的 a0 寄存器的值**

+ **我们先将这个地址里的数值保存在t0寄存器中，之后再将t0寄存器的数值保存在SSCRATCH寄存器中。**
+ **为止目前，所有的寄存器内容还是属于内核。**

---

3. **接下来恢复原本的用户寄存器数据**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/59738ab62d83f62c395e5f06272dd2db.jpeg)

**接下来的这些指令将a0寄存器指向的trapframe中，之前保存的寄存器的值加载到对应的各个寄存器中。之后，我们离能真正运行用户代码就很近了。**

---

> **学生提问：现在trapframe中的a0寄存器是我们执行系统调用的返回值吗？**
>
> **Robert教授：是的，系统调用的返回值覆盖了我们保存在trapframe中的a0寄存器的值（详见6.6）。我们希望用户程序Shell在a0寄存器中看到系统调用的返回值。所以，trapframe中的a0寄存器现在是系统调用的返回值2。相应的SSCRATCH寄存器中的数值也应该是2，可以通过打印寄存器的值来验证。**
>
> ![](https://raw.githubusercontent.com/ScuDays/MyImg/master/e0be42ad6f89b0bebfba71e88550966e.jpeg)
>

---

4. **现在我们打印所有的寄存器**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/adb35302371aceb098324603efad7cb1.jpeg)

+ **这些寄存器的值就是我们在最最开始看到的用户寄存器的值。例如SP寄存器保存的是user stack地址，这是一个在较小的内存地址；a1寄存器是我们传递给write的buffer指针，a2是我们传递给write函数的写入字节数。**
+ **a0寄存器现在还是个例外，它现在仍然是指向trapframe的指针，而不是保存了的用户数据。**



---

5. **交换SSCRATCH寄存器和a0寄存器的值**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/be708111e8a94ba316426bf501b35a47.jpeg)

+ **接下来，在我们即将返回到用户空间之前，我们交换SSCRATCH寄存器和a0寄存器的值。前面我们看过了SSCRATCH现在的值是系统调用的返回值2，a0寄存器是trapframe的地址。交换完成之后，a0持有的是系统调用的返回值，SSCRATCH持有的是trapframe的地址。之后trapframe的地址会一直保存在SSCRATCH中，直到用户程序执行了另一次trap。现在我们还在kernel中。**

---

6. **执行sret 返回用户空间**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/be708111e8a94ba316426bf501b35a47.jpeg)

**sret是我们在kernel中的最后一条指令，当执行完这条指令：**

+ **程序会切换回user mode **
+ **<font style="background-color:#FBDE28;">SEPC 寄存器的数值会被拷贝到PC寄存器（程序计数器）</font>**
+ **重新会打开中断**

---

7. **现在我们回到了用户空间。**

**打印PC寄存器**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/9aaa320c3967a3073d870123fbd5e1ee.jpeg)

**这是一个较小的指令地址，非常像是在用户内存中。如果我们查看sh.asm，可以看到这个地址是write函数的ret指令地址。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/46b7782fb3727c6c85f7336ef2f52814.jpeg)

**所以，现在我们回到了用户空间，执行完ret指令之后我们就可以从write系统调用返回到Shell中了。**

**或者更严格的说，是从触发了系统调用的write库函数中返回到Shell中。**

---

> **学生提问：**
>
> **你可以再重复一下在sret过程中，中断会发生什么吗？**
>
> **Robert教授：**
>
> **sret打开了中断。所以在supervisor mode中的最后一个指令，我们会重新打开中断。用户程序可能会运行很长时间，最好是能在这段时间响应例如磁盘中断。**
>

---

**最后总结一下：**

1. **系统调用被刻意设计的看起来像是函数调用，但是背后的user/kernel转换比函数调用要复杂的多。之所以这么复杂，很大一部分原因是要保持user/kernel之间的隔离性，内核不能信任来自用户空间的任何内容。**

**另一方面，XV6实现trap的方式比较特殊，XV6并不关心性能。但是通常来说，操作系统的设计人员和CPU设计人员非常关心如何提升trap的效率和速度。必然还有跟我们这里不一样的方式来实现trap**

**当你在实现的时候，可以从以下几个问题出发：**

1. **硬件和软件需要协同工作，你可能需要重新设计XV6，重新设计RISC-V来使得这里的处理流程更加简单，更加快速。**
2. **另一个需要时刻记住的问题是，恶意软件是否能滥用这里的机制来打破隔离性。**




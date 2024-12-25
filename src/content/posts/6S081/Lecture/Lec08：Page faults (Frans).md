---
title: Lec08：Page faults (Frans)
date: 2024-10-09 00:39:59
modify: 2024-12-22 16:41:02
author: days
category: 6S081
published: 2024-10-09
---
# Lec08：Page faults (Frans)
##  [<font style="color:rgb(27, 27, 27);">8.1 Page Fault Basics</font>](https://mit-public-courses-cn-translatio.gitbook.io/mit6-s081/lec08-page-faults-frans/8.1-page-fault-basics)
**通过 page fault可以实现的一系列虚拟内存功能**

+ **lazy allocation**
+ **copy-on-write fork**
+ **demand paging**
+ **memory mapped files**

**回顾一下虚拟内存两个主要的优点：**

+ **第一个是Isolation，隔离性。**

虚拟内存使得操作系统可以为每个应用程序提供属于它们自己的地址空间。所以一个应用程序不可能有意或者无意的修改另一个应用程序的内存数据。虚拟内存同时也提供了用户空间和内核空间的隔离性。

+ **第二个好处是level of indirection，提供一层抽象。**

处理器和所有的指令都可以使用虚拟地址，而内核会定义从虚拟地址到物理地址的映射关系。

这一层抽象是我们这节课要讨论的许多有趣功能的基础。不过到目前为止，在XV6中在内核中基本上是直接映射（也就是虚拟地址等于物理地址）。有一些特殊比较有趣的地方

    - trampoline page，它使得内核可以将一个物理内存page映射到多个用户地址空间中。
    - guard page，它同时在内核空间和用户空间用来保护Stack。

**但在 xv6 中，****不管是user page table还是kernel page table，都在最开始的时候设置好，之后不做任何变动。**

**而通过 page fault 我们可以让地址映射关系变得动态起来。**

**通过page fault，内核可以更新page table，这是一个非常强大的功能。**

**结合page table和page fault，动态的更新虚拟地址，内核将会有巨大的灵活性。**

**后面我们会看到各种各样利用动态变更page table实现的有趣的功能。**

---

**但是在那之前，首先，我们需要思考的是，什么样的信息对于page fault是必须的。或者说，当发生page fault时，内核需要什么样的信息才能够响应page fault。**

+ **第一个信息，引起 page fault 的内存地址**
    - 你知道，当出现page fault的时候，XV6内核会打印出错的虚拟地址，并且这个地址会被保存在`**STVAL寄存器**`中。所以，当一个用户应用程序触发了page fault，page fault会使用与Robert教授上节课介绍的相同的trap机制，将程序运行切换到内核，同时也会将出错的地址存放在`**STVAL寄存器**`中。这是我们需要知道的第一个信息。
+ **第二个信息，引起 page fault 的原因类型，对不同场景的page fault有不同的响应。**
    - 不同的场景是指，比如因为load指令触发的page fault、因为store指令触发的page fault又或者是因为jump指令触发的page fault。所以实际上如果你查看RISC-V的文档，在**SCAUSE**（注，Supervisor cause寄存器，保存了trap机制中进入到supervisor mode的原因）寄存器的介绍中，有多个与page fault相关的原因。比如，**13表示是因为load引起的page fault；15表示是因为store引起的page fault；12表示是因为指令执行引起的page fault**。所以第二个信息**存在**`**SCAUSE**`**寄存器**中，**其中总共有3个类型的原因与page fault相关，分别是读、写和指令。**ECALL进入到supervisor mode对应的是8，这是我们在上节课中应该看到的SCAUSE值。基本上来说，page fault和其他的异常使用与系统调用相同的trap机制（注，详见lec06）来从用户空间切换到内核空间。如果是因为page fault触发的trap机制并且进入到内核空间，STVAL寄存器和SCAUSE寄存器都会有相应的值。

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/592e2ce2f893c6c90cc79b753205cf6f.jpeg)

+ **第三个信息，引起page fault时的程序计数器值，这表明了page fault在用户空间发生的位置**
    - 从上节课可以知道，作为trap处理代码的一部分，这个地址存放在SEPC（Supervisor Exception Program Counter）寄存器中，并同时会保存在trapframe->epc（注，详见lec06）中。

**我们之所以关心触发page fault时的程序计数器值，是因为在page fault handler中我们或许想要修复page table，并重新执行对应的指令。理想情况下，修复完page table之后，指令就可以无错误的运行了。所以，能够恢复因为page fault中断的指令运行是很重要的。**

接下来我们将查看不同虚拟内存功能的实现机制，来帮助我们理解如何利用page fault handler修复page table并做一些有趣的事情。

## [<font style="color:rgb(27, 27, 27);">8.2 Lazy page allocation</font>](https://mit-public-courses-cn-translatio.gitbook.io/mit6-s081/lec08-page-faults-frans/8.2-lazy-page-allocation)
> **<font style="color:rgb(27, 27, 27);">基于page fault和page table 实现的第一个功能</font>**
>

**<font style="color:rgb(27, 27, 27);">首先来看一下内存allocation，或者更具体的说是 sbrk()。</font>**

**<font style="color:rgb(27, 27, 27);">sbrk是XV6提供的系统调用，它使得用户应用程序能扩大自己的 heap。</font>**

**<font style="color:rgb(27, 27, 27);">当一个应用程序启动的时候，sbrk指向的是heap的最底端，同时也是stack的最顶端。这个位置通过代表进程的数据结构中的sz字段表示，这里以</font>**_**<font style="color:rgb(27, 27, 27);">p->sz表示</font>**_**<font style="color:rgb(27, 27, 27);">。</font>**

![|750](https://raw.githubusercontent.com/ScuDays/MyImg/master/3e01715e78e1e1b56450d74ba17e8307.jpeg)

**<font style="color:rgb(27, 27, 27);">当调用sbrk时，参数为整数，代表了你想要申请的page数量（注，原视频说的是page，但是根据Linux </font>**[**man page**](https://man7.org/linux/man-pages/man2/sbrk.2.html)**<font style="color:rgb(27, 27, 27);">，实际中sbrk的参数是字节数）。sbrk会扩展heap的上边界（也就是会扩大heap）。</font>**

**<font style="color:rgb(27, 27, 27);">扩展后如下图 xz</font>**

**<font style="color:rgb(27, 27, 27);">注意：heap(堆)向上增长，stack(栈)向下增长</font>**

![用户进程的虚拟地址空间分布|768](https://raw.githubusercontent.com/ScuDays/MyImg/master/8ca948ec7153f4431e576e700439d4a2.jpeg)

+ **<font style="color:rgb(27, 27, 27);">这意味着，当sbrk实际发生或者被调用的时候，内核会分配一些物理内存，并将这些内存映射到用户应用程序的地址空间，然后将内存内容初始化为0，再返回sbrk系统调用。</font>**
+ **<font style="color:rgb(27, 27, 27);">这样，应用程序可以通过多次sbrk系统调用来增加它所需要的内存。应用程序爷可以通过给sbrk传入负数作为参数，来减少它的地址空间。</font>**<font style="color:rgb(27, 27, 27);">不过在这节课我们只关注增加内存的场景。</font>

---

**<font style="color:rgb(27, 27, 27);">在XV6中，sbrk的实现默认是 </font>****<font style="color:#DF2A3F;">eager allocation</font>****<font style="color:rgb(27, 27, 27);">。这表示一旦调用了sbrk，内核会立即分配应用程序所需要的物理内存。</font>**

---

**<font style="color:rgb(27, 27, 27);">但是实际上，应用程序很难预测自己到底需要多少内存，所以通常，应用程序倾向于申请多于自己所需要的内存。这意味着，进程的内存消耗会增加，但有部分内存永远也不会被应用程序所使用到。</font>**

<font style="color:rgb(27, 27, 27);">比如：算法考虑最坏情况，申请一个最坏情况下才会达到的内存空间</font>**<font style="color:rgb(27, 27, 27);"> </font>**

---

+ **<font style="color:rgb(27, 27, 27);">利用 </font>****<font style="color:#DF2A3F;">lazy allocation</font>****<font style="color:rgb(27, 27, 27);">。我们可以更聪明地来解决问题</font>**

**<font style="color:rgb(27, 27, 27);">核心思想非常简单：</font>**

1. **<font style="color:rgb(27, 27, 27);">sbrk系统调用基本上不做任何事情，唯一需要做的事情就是提升</font>**_**<font style="color:rgb(27, 27, 27);">p->sz</font>**_**<font style="color:rgb(27, 27, 27);">，将</font>**_**<font style="color:rgb(27, 27, 27);">p->sz</font>**_**<font style="color:rgb(27, 27, 27);">增加n，其中n是需要新分配的内存page数量。</font>**
2. **<font style="color:rgb(27, 27, 27);">但内核在这个时间点实际上并不会分配任何物理内存。</font>**
3. **<font style="color:rgb(27, 27, 27);">之后，当应用程序使用到了新申请的那部分内存时会触发page fault，因为我们还没有将新的内存映射到page table。</font>**
4. **<font style="color:rgb(27, 27, 27);">所以，如果我们发现一个虚拟地址大于旧的</font>**_**<font style="color:rgb(27, 27, 27);">p->sz</font>**_**<font style="color:rgb(27, 27, 27);">，但是又小于新的</font>**_**<font style="color:rgb(27, 27, 27);">p->sz（注，也就是旧的p->sz + n）</font>**_**<font style="color:rgb(27, 27, 27);">，我们再通过内核分配一个内存page，并且重新执行所需指令。</font>**

---

举例：

**<font style="color:rgb(27, 27, 27);">所以，当我们看到了一个page fault，相应的虚拟地址小于当前 </font>**_**<font style="color:rgb(27, 27, 27);">p->sz </font>**_**<font style="color:rgb(27, 27, 27);">，同时大于 stack ，那么我们就知道这是一个来自于heap的地址，且这个地址对应内核还没有分配任何物理内存。</font>**

**<font style="color:rgb(27, 27, 27);">所以对于这个page fault的响应也直接明了：</font>**

+ **<font style="color:rgb(27, 27, 27);">在page fault handler中，通过kalloc函数分配一个内存page；</font>**
+ **<font style="color:rgb(27, 27, 27);">初始化这个page内容为0；将这个内存page映射到user page table中；</font>**
+ **<font style="color:rgb(27, 27, 27);">最后重新执行指令。</font>**

**<font style="color:rgb(27, 27, 27);">比方说，如果是load指令，或者store指令要访问属于当前进程但是还未被分配的内存，在我们映射完新申请的物理内存page之后，重新执行指令应该就能通过了。</font>**

## [<font style="color:rgb(27, 27, 27);">8.3 Zero Fill On Demand</font>](https://mit-public-courses-cn-translatio.gitbook.io/mit6-s081/lec08-page-faults-frans/8.3-zero-fill-on-demand)
> **<font style="color:rgb(27, 27, 27);">基于page fault和page table 实现的第二个功能，简单但频繁使用</font>**
>

+ **<font style="color:rgb(27, 27, 27);">当你查看一个用户程序的地址空间时，存在text区域，data区域，同时还有一个BSS区域。</font>**

**<font style="color:rgb(27, 27, 27);">BSS 区域：是数据段（data）的一部分（注，BSS区域包含了未被初始化或者初始化为0的全局或者静态变量）。</font>**

+ **<font style="color:rgb(27, 27, 27);">当编译器在生成二进制文件时，编译器会填入这三个区域。text区域是程序的指令，data区域存放的是初始化了的全局变量，BSS包含了未被初始化或者初始化为0的全局变量。</font>**

**<font style="color:rgb(27, 27, 27);">为什么要把未被初始化或者初始化为0的全局变量单独列出来一块到 BSS 中？</font>**

+ **<font style="color:rgb(27, 27, 27);">是因为，例如你在C语言中定义了一个大的矩阵作为全局变量，它的元素初始值都是0，为什么要为这个矩阵分配内存呢？其实只需要记住这个矩阵的内容是0就行。</font>**

---

+ **<font style="color:rgb(27, 27, 27);">在一个正常的操作系统中，如果执行exec，exec会申请地址空间，里面会存放text和data。因为BSS里面保存了未被初始化的全局变量，里面或许有非常多个page，但所有的page内容都为0。</font>**

**<font style="color:rgb(27, 27, 27);">通常可以调优的地方是：</font>**

+ **<font style="color:rgb(27, 27, 27);">有如此多的内容全是0的page，在物理内存中，只需要分配一个page，这个page的内容全是0。然后将所有虚拟地址空间的全0的page都map到这一个物理page上。这样至少在程序启动的时候能节省大量的物理内存分配。</font>**

![|908](https://raw.githubusercontent.com/ScuDays/MyImg/master/1d6f1d4df93a23789a0aaebd6a15f659.jpeg)

---

+ **<font style="color:rgb(27, 27, 27);">这里的 mapping 需要非常的小心，我们不能允许用户对于这个 page 执行写操作，因为这里所有的虚拟地址空间 page 内容都期望为 0，所以这里的PTE都是只读的。</font>**

---

+ **<font style="color:rgb(27, 27, 27);">之后在某个时间点，应用程序尝试写 BSS 中的一个 page 时，比如说需要更改一两个变量的值，我们会得到 page fault 。那么，对于这个 page fault 我们该做什么呢？</font>**

**<font style="color:rgb(27, 27, 27);">学生回答：我认为我们应该创建一个新的page，将其内容设置为0，并重新执行指令。</font>**

+ **<font style="color:rgb(27, 27, 27);">是的，完全正确。假设store指令发生在BSS最顶端的page中。我们想要做的是，在物理内存中申请一个新的内存 page ，将其内容设置为0，因为我们预期这个内存的内容为0。之后我们需要更新这个 page 的 mapping 关系，首先 PTE 要设置成可读可写，然后将其指向新的物理 page 。这里相当于更新了 PTE ，之后我们可以重新执行指令。</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/161da5099058af97d6eca06092653f61.jpeg)

---

+ **<font style="color:rgb(27, 27, 27);">第一个好处：</font>**<font style="color:rgb(27, 27, 27);">这样节省一部分内存。你可以在需要的时候才申请内存。</font>
+ **<font style="color:rgb(27, 27, 27);">第二个好处：</font>**<font style="color:rgb(27, 27, 27);">在exec中需要做的工作变少，不需要映射一大堆的内存。程序可以更快启动，你可以获得更好的交互体验，因为你只需要分配一个内容全是0的物理page。所有的虚拟page都可以映射到这一个物理page上。</font>

**<font style="color:rgb(27, 27, 27);">学生提问：</font>**<font style="color:rgb(27, 27, 27);">但是</font>**<font style="color:rgb(27, 27, 27);">每次都会触发一个page fault，update和write会变得更慢吧</font>**<font style="color:rgb(27, 27, 27);">？</font>

**<font style="color:rgb(27, 27, 27);">Frans教授：</font>**<font style="color:rgb(27, 27, 27);">是的，这是个很好的观点，所以这里是</font>**<font style="color:rgb(27, 27, 27);">实际上我们将一些操作推迟到了page fault再去执行</font>**<font style="color:rgb(27, 27, 27);">。并且我们期望并不是所有的 page 都被使用了。如果一个page 是 4096 字节，我们只需要对每 4096 个字节消耗一次 page fault 即可。这里是个好的观点，我们的确增加了一些由 page fault 带来的代价。</font>

**<font style="color:rgb(27, 27, 27);">Frans教授：</font>**<font style="color:rgb(27, 27, 27);">page fault的代价是多少呢？我们该如何看待它？这是一个与store指令相当的代价，还是说代价要高的多？</font>

**<font style="color:rgb(27, 27, 27);">学生回答：</font>**<font style="color:rgb(27, 27, 27);">代价要高的多。store指令可能需要消耗一些时间来访问RAM，但是page fault需要走到内核。</font>

**<font style="color:rgb(27, 27, 27);">Frans教授：</font>**<font style="color:rgb(27, 27, 27);">是的，在lec06中你们已经看到了，仅仅是在trap处理代码中，就有至少有100个store指令用来存储当前的寄存器。除此之外，还有从用户空间转到内核空间的额外开销。所以，page fault并不是没有代价的。</font>

## [<font style="color:rgb(27, 27, 27);">8.4 Copy On Write Fork</font>](https://mit-public-courses-cn-translatio.gitbook.io/mit6-s081/lec08-page-faults-frans/8.4-copy-on-write-fork)
> **<font style="color:rgb(27, 27, 27);">基于page fault和page table 实现的一个非常常见的优化，许多操作系统都实现了它。</font>**
>

**<font style="color:rgb(27, 27, 27);">copy-on-write fork，也称为COW fork。</font>**

---

+ **fork 中复制 page 的操作**
1. **<font style="color:rgb(27, 27, 27);">当Shell处理指令时，它会用 fork 创建一个子进程。</font>**
2. **<font style="color:rgb(27, 27, 27);">fork 会创建一个 Shell 进程的拷贝，所以这时我们有一个父进程（原来的Shell）和一个子进程。</font>**
3. **<font style="color:rgb(27, 27, 27);">Shell 的子进程执行的第一件事情就是调用 exec 运行一些其他程序，比如运行 echo。</font>**
4. **<font style="color:rgb(27, 27, 27);">现在的情况是，fork创建了Shell地址空间的一个完整的拷贝，而 exec 第一件事情就是释放地址空间，又重新申请了一个包含了echo的地址空间。这看起来有点浪费。</font>**

![|475](https://raw.githubusercontent.com/ScuDays/MyImg/master/e78183da5f77b2be278a9515b508a312.jpeg)	

---

+ **我们开始使用 COW FORK 进行优化**

**所以，我们最开始有了一个父进程的虚拟地址空间，然后我们有了子进程的虚拟地址空间。**

**在物理内存中，XV6中的Shell通常会有4个page，当调用fork时，基本上就是创建了4个新的page，并将父进程page的内容拷贝到4个新的子进程的page中。**

![|615](https://raw.githubusercontent.com/ScuDays/MyImg/master/261db463e93238ad32b83995334d0aa4.jpeg)

---

+ **1： 对内存有效的优化**

**<font style="color:rgb(27, 27, 27);">但是之后，一旦调用了exec，我们又会释放这些page，并分配新的page来包含echo相关的内容。</font>**

+ **<font style="color:rgb(27, 27, 27);">所以对于这个特定场景有一个非常有效的优化：</font>**

<font style="color:rgb(27, 27, 27);">当我们创建子进程时，与其创建，分配并拷贝内容到新的物理内存，我们可以直接共享父进程的物理内存page。所以这里，我们可以设置子进程的PTE指向父进程对应的物理内存page。</font>

+ **<font style="color:rgb(27, 27, 27);">当然，我们这里需要非常小心。</font>**

<font style="color:rgb(27, 27, 27);">因为一旦子进程想要修改这些内存的内容，相应的更新应该对父进程不可见，因为我们希望在父进程和子进程之间有强隔离性，所以这里我们需要更加小心一些。为了确保进程间的隔离性，我们可以将这里的父进程和子进程的PTE的标志位都设置成只读的。</font>

![550](https://raw.githubusercontent.com/ScuDays/MyImg/master/8e5cfddcd1ec09a1af09fc2a8e064ce0.jpeg)

---

+ **2： 当内存真正需要使用的时候**



+ **<font style="color:rgb(27, 27, 27);">在某个时间点，当我们需要更改内存的内容时，我们会得到page fault。因为现在父进程或子进程在向一个只读的PTE写数据。</font>**

**<font style="color:rgb(27, 27, 27);">解决：在得到page fault之后，我们需要拷贝相应的物理page。</font>**

1. **<font style="color:rgb(27, 27, 27);">假设现在是子进程在执行store指令，那么我们会分配一个新的物理内存page</font>**
2. **<font style="color:rgb(27, 27, 27);">然后将page fault相关的物理内存page拷贝到新分配的物理内存page中</font>**
3. **<font style="color:rgb(27, 27, 27);">并将新分配的物理内存page映射到子进程。</font>**

**<font style="color:rgb(27, 27, 27);">这时，新分配的物理内存page只对子进程的地址空间可见，所以我们可以将相应的PTE设置成可读写(同时保证了隔离性)，并且我们可以重新执行store指令。</font>**

**<font style="color:rgb(27, 27, 27);">实际上，对于触发刚刚page fault的物理page，因为现在只对父进程可见，相应的PTE对于父进程也变成可读写的了。</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/d6e04cebf72dcae2f6608ee70bc28094.jpeg)

**<font style="color:rgb(27, 27, 27);">所以现在，我们拷贝了一个page，将新的page映射到相应的用户地址空间，并重新执行用户指令。重新执行用户指令是指调用userret函数（注，详见6.8），也即是lec06中介绍的返回到用户空间的方法。</font>**

![|771](https://raw.githubusercontent.com/ScuDays/MyImg/master/6ca7905cacd62a5233850f12e6b31b79.jpeg)

---

> **<font style="color:rgb(27, 27, 27);">学生提问：</font>**<font style="color:rgb(27, 27, 27);">我们如何发现父进程写了这部分内存地址？是与子进程相同的方法吗？</font>
>
> **<font style="color:rgb(27, 27, 27);">Frans教授</font>**<font style="color:rgb(27, 27, 27);">：是的，因为子进程的地址空间来自于父进程的地址空间的拷贝。如果我们使用了特定的虚拟地址，因为地址空间是相同的，不论是父进程还是子进程，都会有相同的处理方式。</font>
>
> **<font style="color:rgb(27, 27, 27);">学生提问：</font>**<font style="color:rgb(27, 27, 27);">对于一些没有父进程的进程，比如系统启动的第一个进程，它会对于自己的PTE设置成只读的吗？还是设置成可读写的，然后在fork的时候再修改成只读的？</font>
>
> **<font style="color:rgb(27, 27, 27);">Frans教授：</font>**<font style="color:rgb(27, 27, 27);">这取决于你。实际上在lazy lab之后，会有一个copy-on-write lab。在这个lab中，你自己可以选择实现方式。当然最简单的方式就是将PTE设置成只读的，当你要写这些page时，你会得到一个page fault，之后你可以再按照上面的流程进行处理。</font>
>
> **<font style="color:rgb(27, 27, 27);">学生提问：</font>**<font style="color:rgb(27, 27, 27);">因为我们经常会拷贝用户进程对应的page，内存硬件有没有实现特定的指令来完成拷贝，因为通常来说内存会有一些读写指令，但是因为我们现在有了从page a拷贝到page b的需求，会有相应的拷贝指令吗？</font>
>
> **<font style="color:rgb(27, 27, 27);">Frans教授：</font>**<font style="color:rgb(27, 27, 27);">x86有硬件指令可以用来拷贝一段内存。但是RISC-V并没有这样的指令。当然在一个高性能的实现中，所有这些读写操作都会流水线化，并且按照内存的带宽速度来运行。</font>
>
> <font style="color:rgb(27, 27, 27);">在我们这个例子中，我们只需要拷贝1个page，对于一个未修改的XV6系统，我们需要拷贝4个page。所以这里的方法明显更好，因为内存消耗的更少，并且性能会更高，fork会执行的更快。</font>
>

> **<font style="color:rgb(27, 27, 27);">学生提问：</font>**<font style="color:rgb(27, 27, 27);">当发生page fault时，我们其实是在向一个只读的地址执行写操作。内核如何能分辨现在是一个copy-on-write fork的场景，而不是应用程序在向一个正常的只读地址写数据。是不是说默认情况下，用户程序的PTE都是可读写的，除非在copy-on-write fork的场景下才可能出现只读的PTE？</font>
>
> **<font style="color:rgb(27, 27, 27);">Frans教授：</font>**<font style="color:rgb(27, 27, 27);">内核必须要能够识别这是一个copy-on-write场景。几乎所有的page table硬件都支持了这一点。我们之前并没有提到相关的内容，</font>**<font style="color:rgb(27, 27, 27);">下图是一个常见的多级page table。对于PTE的标志位，我之前介绍过第0bit到第7bit，但是没有介绍最后两位RSW。这两位保留给supervisor software使用，supervisor softeware指的就是内核。</font>**<font style="color:rgb(27, 27, 27);">内核可以随意使用这两个bit位。所以可以做的一件事情就是，将bit8标识为当前是一个copy-on-write page。</font>
>
> ![](https://raw.githubusercontent.com/ScuDays/MyImg/master/47640b4a1454d1e51fac97fab013f290.jpeg)
>
> **<font style="color:rgb(27, 27, 27);">当内核在管理这些page table时，对于copy-on-write相关的page，内核可以设置相应的bit位，这样当发生page fault时，我们可以发现如果copy-on-write bit位设置了，我们就可以执行相应的操作了。否则的话，比如说lazy allocation，我们就做一些其他的处理操作。</font>**
>
> **<font style="color:rgb(27, 27, 27);">在copy-on-write lab中，你们会使用RSW在PTE中设置一个copy-on-write标志位。</font>**
>

---

+ **<font style="color:rgb(27, 27, 27);">在copy-on-write lab中，还有个细节需要注意。</font>**

**<font style="color:rgb(27, 27, 27);">对于这里的物理内存page，如果有多个用户进程或者说多个地址空间都指向了相同的物理内存page，举个例子，当父进程退出时我们需要非常小心，因为我们要判断是否能立即释放相应的物理page。</font>**

**<font style="color:rgb(27, 27, 27);">如果有子进程还在使用这些物理page，而内核又释放了这些物理page，我们将会出问题。</font>**

+ **<font style="color:rgb(27, 27, 27);">那么现在我们什么时候才能释放内存 page 呢？</font>**

**<font style="color:rgb(27, 27, 27);">我们需要对于每一个物理内存page的引用进行计数，当我们释放虚拟page时，我们将物理内存page的引用数减1，如果引用数等于0，那么我们就能释放物理内存page。</font>**

> **<font style="color:rgb(27, 27, 27);">学生提问：</font>**<font style="color:rgb(27, 27, 27);">我们应该在哪存储这些引用计数呢？因为如果我们需要对每个物理内存page的引用计数的话，这些计数可能会有很多。</font>
>
> **<font style="color:rgb(27, 27, 27);">Frans教授：</font>**<font style="color:rgb(27, 27, 27);">对于每个物理内存page，我们都需要做引用计数，也就是说对于每4096个字节，我们都需要维护一个引用计数（似乎并没有回答问题）。</font>
>
> **<font style="color:rgb(27, 27, 27);">学生提问：</font>**<font style="color:rgb(27, 27, 27);">我们可以将引用计数存在RSW对应的2个bit中吗？并且限制不超过4个引用。</font>
>
> **<font style="color:rgb(27, 27, 27);">Frans教授：</font>**<font style="color:rgb(27, 27, 27);">讲道理，如果引用超过了4次，那么将会是一个问题。因为一个内存引用超过了4次，你将不能再使用这里的优化了。但是这里的实现方式是自由的。</font>
>
> **<font style="color:rgb(27, 27, 27);">学生提问：</font>**<font style="color:rgb(27, 27, 27);">真的有必要额外增加一位来表示当前的page是copy-on-write吗？因为内核可以维护有关进程的一些信息...</font>
>
> **<font style="color:rgb(27, 27, 27);">Frans教授：</font>**<font style="color:rgb(27, 27, 27);">是的，你可以在管理用户地址空间时维护一些其他的元数据信息，这样你就知道这部分虚拟内存地址如果发生了page fault，那么必然是copy-on-write场景。实际上，在后面的一个实验中，你们需要出于相同的原因扩展XV6管理的元数据。在你们完成这些实验时，具体的实现是很自由的。</font>
>

## [<font style="color:rgb(27, 27, 27);">8.5 Demand Paging</font>](https://mit-public-courses-cn-translatio.gitbook.io/mit6-s081/lec08-page-faults-frans/8.5-demand-paging)
> **<font style="color:rgb(27, 27, 27);">基于page fault和page table 实现的一个非常流行的功能，许多操作系统都实现了它。</font>**
>

**<font style="color:rgb(27, 27, 27);">在 未修改的XV6中，exec() 中，操作系统会加载程序内存的text，data区域，并且以 eager (立即) 的方式将这些区域加载进page table。</font>**

![|469](https://raw.githubusercontent.com/ScuDays/MyImg/master/bfdfd9052c57b843d5a944b95f537b27.jpeg)

![|272](https://raw.githubusercontent.com/ScuDays/MyImg/master/16ea26cc9113d3ea15b09f3e6baf88d8.png)

---

+ **使用 lazy 加载**
+ **<font style="color:rgb(27, 27, 27);">但为什么我们要以 eager 的方式将程序加载到内存中？</font>**
+ **<font style="color:rgb(27, 27, 27);">为什么不直到应用程序实际需要这些指令的时候再加载内存？</font>**
+ **<font style="color:rgb(27, 27, 27);">程序的二进制文件可能非常的巨大，将它全部从磁盘加载到内存中将会是一个代价很高的操作。又或者data区域的大小远大于常见的场景所需要的大小。</font>**

**<font style="color:rgb(27, 27, 27);">所以对于 exec，在虚拟地址空间中，我们为text和data分配好地址段，但是相应的PTE并不实际对应任何物理内存 page 。对于这些PTE，我们只需要将valid bit 位设置为0即可。</font>**

---

+ **什么时候会遇到第一个 page fault？**
+ **<font style="color:rgb(27, 27, 27);">如果我们修改XV6使其按照上面的方式工作，我们什么时候会得到第一个page fault呢？或者说，用户应用程序运行的第一条指令是什么？用户应用程序在哪里启动的？</font>**

**<font style="color:rgb(27, 27, 27);">位于地址0的指令是会触发第一个page fault的指令，因为应用程序是从地址0开始运行并且 text 区域从地址0开始向上增长。</font>**

![|556](https://raw.githubusercontent.com/ScuDays/MyImg/master/f8d030f28ede735d1f355f8c437e2c1e.jpeg)

---

+ **遇到 page fault 要如何处理？**
1. **<font style="color:rgb(27, 27, 27);">首先我们需要知道，这些 page 是on-demand page。</font>**
2. **<font style="color:rgb(27, 27, 27);">我们需要在某个地方记录了这些 page 对应的程序文件</font>**
3. **<font style="color:rgb(27, 27, 27);">我们在 page fault handler 中需要从程序文件中读取page数据，加载到内存中；</font>**
4. **<font style="color:rgb(27, 27, 27);">之后将内存page映射到page table；最后再重新执行指令。</font>**
5. **<font style="color:rgb(27, 27, 27);">之后程序就可以运行了。</font>**

---

+ **问题：如果内存耗尽了怎么办？**
+ **回答：撤回内存**

<font style="color:rgb(27, 27, 27);">我们将要读取的文件，它的text和data区域可能大于物理内存的容量。对于demand paging来说，假设内存已经耗尽了或者说OOM了，这个时候如果得到了一个page fault，需要从文件系统拷贝中拷贝一些内容到内存中，但这时你又没有任何可用的物理内存page。</font>

+ **<font style="color:rgb(27, 27, 27);">这其实回到了之前的一个问题：在lazy allocation中，如果内存耗尽了该如何办？</font>**
1. **一个选择是撤回某个 page（evict page）。比如说将部分内存 page 中的内容写回到文件系统再撤回 page。那么你就有了一个新的空闲的page，分配给刚刚的 page fault handler，再重新执行指令。**

---

+ **问题：使用什么策略来选择撤回的内存**
1. **Least Recently Used （LRU）**
2. **dirty page 和  non-dirty page**

---

+ **问题：如何判断是否 dirty？或者 least recently used？**

**<font style="color:rgb(27, 27, 27);">看PTE，我们有RSW位，你们可以发现在bit7，对应的就是Dirty bit。当硬件向一个page写入数据，会设置dirty bit，之后操作系统就可以发现这个page曾经被写入了。</font>**

**<font style="color:rgb(27, 27, 27);">类似的，还有一个Access bit，任何时候一个page被读或者被写了，这个Access bit会被设置。Access bit通常被用来实现这里的LRU策略。</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/2d0b873df771635685b7c6a7e50416e0.jpeg)

## [<font style="color:rgb(27, 27, 27);">8.6 Memory Mapped Files</font>](https://mit-public-courses-cn-translatio.gitbook.io/mit6-s081/lec08-page-faults-frans/8.6-memory-mapped-files)
**<font style="color:rgb(27, 27, 27);">这节课最后要讨论的内容，也是后面的一个实验，就是memory mapped files。这里的核心思想是，将完整或者部分文件加载到内存中，这样就可以通过内存地址相关的load或者store指令来操纵文件。为了支持这个功能，一个现代的操作系统会提供一个叫做mmap的系统调用。这个系统调用会接收一个虚拟内存地址（VA），长度（len），protection，一些标志位，一个打开文件的文件描述符，和偏移量（offset）。</font>**

![550](https://raw.githubusercontent.com/ScuDays/MyImg/master/f5e07799c1a0780dee5a0c06d0c4f102.jpeg)

**<font style="color:rgb(27, 27, 27);">这里的语义就是，从文件描述符对应的文件的偏移量的位置开始，映射长度为len的内容到虚拟内存地址VA，同时我们需要加上一些保护，比如只读或者读写。</font>**

**<font style="color:rgb(27, 27, 27);">假设文件内容是读写并且内核实现mmap的方式是eager方式（不过大部分系统都不会这么做），内核会从文件的offset位置开始，将数据拷贝到内存，设置好PTE指向物理内存的位置。之后应用程序就可以使用load或者store指令来修改内存中对应的文件内容。</font>**

**<font style="color:rgb(27, 27, 27);">当完成操作之后，会有一个对应的unmap系统调用，参数是虚拟地址（VA），长度（len）。来表明应用程序已经完成了对文件的操作，在unmap时间点，我们需要将dirty block写回到文件中。我们可以很容易的找到哪些block是dirty的，因为它们在PTE中的dirty bit为1。</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/733cfbb4a28a2c4189cc3a774af71ae7.jpeg)

**<font style="color:rgb(27, 27, 27);">当然，在任何聪明的内存管理机制中，所有的这些都是以lazy的方式实现。你不会立即将文件内容拷贝到内存中，而是先记录一下这个PTE属于这个文件描述符。</font>**

**<font style="color:rgb(27, 27, 27);">相应的信息通常在VMA结构体中保存，VMA全称是Virtual Memory Area。</font>**

**<font style="color:rgb(27, 27, 27);">例如对于这里的文件f，会有一个VMA，在VMA中我们会记录文件描述符，偏移量等等，这些信息用来表示对应的内存虚拟地址的实际内容在哪，这样当我们得到一个位于VMA地址范围的page fault时，内核可以从磁盘中读数据，并加载到内存中。所以这里回答之前一个问题，dirty bit是很重要的，因为在unmap中，你需要向文件回写dirty block。</font>**

**<font style="color:rgb(27, 27, 27);"></font>**

**<font style="color:rgb(27, 27, 27);">学生提问：有没有可能多个进程将同一个文件映射到内存，然后会有同步的问题？</font>**

**<font style="color:rgb(27, 27, 27);">Frans教授：好问题。这个问题其实等价于，多个进程同时通过read/write系统调用读写一个文件会怎么样？</font>**

**<font style="color:rgb(27, 27, 27);">这里的行为是不可预知的。write系统调用会以某种顺序出现，如果两个进程向一个文件的block写数据，要么第一个进程的write能生效，要么第二个进程的write能生效，只能是两者之一生效。在这里其实也是一样的，所以我们并不需要考虑冲突的问题。</font>**

**<font style="color:rgb(27, 27, 27);">一个更加成熟的Unix操作系统支持锁定文件，你可以先锁定文件，这样就能保证数据同步。但是默认情况下，并没有同步保证。</font>**

**<font style="color:rgb(27, 27, 27);">学生提问：mmap的参数中，len和flag是什么意思？</font>**

**<font style="color:rgb(27, 27, 27);">Frans教授：len是文件中你想映射到内存中的字节数。prot是read/write。flags会在mmap lab中出现，我认为它表示了这个区域是私有的还是共享的。如果是共享的，那么这个区域可以在多个进程之间共享。</font>**

**<font style="color:rgb(27, 27, 27);">学生提问：如果其他进程直接修改了文件的内容，那么是不是意味着修改的内容不会体现在这里的内存中？</font>**

**<font style="color:rgb(27, 27, 27);">Frans教授：是的。但是如果文件是共享的，那么你应该同步这些变更。我记不太清楚在mmap中，文件共享时会发生什么。</font>**

**<font style="color:rgb(27, 27, 27);">你们会在file system lab之后做这里相关的mmap lab，这将会是我们最后一个虚拟内存实验。</font>**


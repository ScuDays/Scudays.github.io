---
title: Lec04：Page tables (Frans)
date: 2024-12-22 00:39:59
modify: 2024-12-22 16:40:58
author: days
category: 6S081
published: 2024-12-22
---
# <font style="color:#000000;">Lec04：Page tables (Frans)</font>
> **<font style="color:#000000;">今天的内容主要是3个部分：</font>**
>
> 1. **<font style="color:#000000;">首先讨论一下地址空间（Address Spaces）。</font>**
> 2. **<font style="color:#000000;">接下来谈一下支持虚拟内存的硬件。当然，我介绍的是RISC-V相关的硬件。但是从根本上来说，所有的现代处理器都有某种形式的硬件，来作为实现虚拟内存的默认机制。</font>**
> 3. **<font style="color:#000000;">过一下XV6中的虚拟内存代码，并看一下内核地址空间和用户地址空间的结构。</font>**
>

## <font style="color:#000000;">地址空间（Address Spaces）</font>
**<font style="color:#000000;background-color:#FBDE28;">创造虚拟内存的一个出发点是通过它实现隔离性</font>**

---

+ **<font style="color:#000000;">那如果没有隔离性会怎么样？</font>**

**<font style="color:#000000;">不同程序之间可能会相互影响，比如 A 不小心访问了 B 的内存空间，然后更改了一些值，导致 B 运行发生错误；</font>**

**<font style="color:#000000;">或者 A 更改了内核的数据。这些都是问题。</font>**

---

+ **<font style="color:#000000;">所以，我们给包括内核在内的所有程序专属的地址空间。</font>**

**<font style="color:#000000;">所以，当我们运行cat时，它的地址空间从0到某个地址结束。</font>**

**<font style="color:#000000;">当我们运行Shell时，它的地址也从0开始到某个地址结束。内核的地址空间也从0开始到某个地址结束。</font>**

**<font style="color:#000000;">这样就实现了强隔离，每个程序都只能访问自己的内存空间。</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/caaded5140c0a20abb05e554a9a24a7a.png)

## <font style="color:#000000;">页表（Page Table）</font>
### <font style="color:#000000;">内存管理单元（MMU，Memory Management Unit）</font>
> + **<font style="color:#000000;">对于任何一条带有地址的指令，其中的地址都应被认为是虚拟内存地址而非物理地址。</font>**
> + **<font style="color:#000000;">虚拟地址到物理地址的翻译过程</font>**
>

+ **<font style="color:#000000;">什么是 MMU？</font>****<font style="color:#000000;"></font>**
1. <font style="color:#000000;">假设寄存器a0中是地址0x1000，那么这是一个虚拟内存地址。虚拟内存地址会被转到</font><font style="color:#000000;background-color:#FBDE28;">内存管理单元（MMU，Memory Management Unit）</font><font style="color:#000000;"></font>
2. <font style="color:#000000;">内存管理单元会将虚拟地址翻译成物理地址。之后这个物理地址会被用来索引物理内存，并从物理内存加载，或者向物理内存存储数据。</font>
+ <font style="color:#000000;">从CPU的角度来说，一旦MMU打开了，它执行的每条指令中的地址都是虚拟内存地址。</font>
+ <font style="color:#000000;">为了完成虚拟内存地址到物理内存地址的翻译，MMU会有</font><font style="color:#000000;background-color:#FBDE28;">一个表单</font><font style="color:#000000;">，表单中，一边是虚拟内存地址，另一边是物理内存地址。举个例子，虚拟内存地址0x1000对应了一个物理内存地址0xFFF0。这样的表单可以非常灵活。</font>
+ <font style="color:#000000;background-color:#FBDE28;">这个记录得内存地址对应关系的表单</font><font style="color:#000000;">也保存在内存中。所以CPU中需要有一些寄存器用来存放表单在物理内存中的地址。在内存的某个位置保存了地址关系表单，我们假设这个位置的物理内存地址是0x10。</font><font style="color:#000000;background-color:#FBDE28;">那么在RISC-V上一个叫做SATP的寄存器会保存这个表单的地址0x10。</font>

<font style="color:#000000;">总结：</font>

1. <font style="color:#000000;">MMU并不会保存page table，它只会根据 SATP 的值，到内存中读取page table，然后完成翻译</font>

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/03c8532cb3b9d98f2062ee22f909b3c9.png)

### <font style="color:#000000;">页表构建方式</font>
+ **<font style="color:#000000;">如果为每个地址都构建一个表单条目会怎么样？</font>**

**<font style="color:#000000;">原则上说，在RISC-V上会有多少地址，或者一个寄存器可以表示多少个不同的地址呢？</font>**

**<font style="color:#000000;">寄存器是64bit，所以有多少个地址呢？是的，理论上可以表示 2^64 个不同的地址，所以如果我们以地址为粒度来管理，表单会变得非常巨大。单是存储表单就会耗尽我们所有的内存，所以</font>****<font style="color:#000000;">为每个地址都构建一个表单条目是不可行的。</font>**

---

+ **<font style="color:#000000;">接下来我分两步介绍页表在 RISC-V 中是如何工作的。</font>**

#### <font style="color:#000000;">第一步</font>
> **<font style="color:#000000;">第一步：不要为每个地址创建一条表单条目，而是</font>****<font style="color:#000000;background-color:#FBDE28;">为每个内存页 page 创建一条表单条目</font>****<font style="color:#000000;">，所以每一次地址翻译都是针对一个page。</font>**
>
> **<font style="color:#000000;">而RISC-V中，一个page是4KB，也就是4096Bytes。几乎所有的处理器都使用4KB大小的page或者支持4KB大小的page。</font>**
>

**<font style="color:#000000;">现在，内存地址的翻译方式略微的不同了。</font>**

<font style="color:#000000;background-color:#FBDE28;">对于虚拟内存地址，我们将它划分为两个部分，index和offset，index用来查找page，offset对应的是一个page中的哪个字节。</font>

<font style="color:#000000;">当MMU在翻译时</font>

1. <font style="color:#000000;">读取index可以知道物理内存中的page号，这个page号对应了物理内存中的第 4096个字节。</font>
2. <font style="color:#000000;">之后虚拟内存地址中的offset指向了page中的4096个字节中的某一个，假设offset是12，那么page中的第12个字节被使用了。将offset加上page的起始地址，就可以得到物理内存地址。</font>

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/baa379b01859884963d64f53bdc53104.png)

#### <font style="color:#000000;">第二步</font>
**<font style="color:#000000;">通过前面的第一步，我们现在的</font>****<font style="color:#000000;background-color:#FBDE28;">地址转换表是以page为粒度，而不是以单个内存地址为粒度</font>****<font style="color:#000000;">，</font>**

**<font style="color:#000000;">现在这个地址转换表已经可以被称为page table了。但是目前的设计还不能满足实际的需求。如果每个进程都有自己的page table，那么每个page table表会有多大呢？</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/575c33a2a24190be37e51ac3727f9d69.jpeg)

**<font style="color:#000000;">这个page table最多会有2^27个条目（虚拟内存地址中的index长度为27），这是个非常大的数字。如果每个进程都使用这么大的page table，进程需要为page table消耗大量的内存，并且很快物理内存就会耗尽。</font>**

> + <font style="color:#000000;">实际上，page table是一个多级的结构</font>
> + <font style="color:#000000;background-color:#FBDE28;">前面每一级得到的 PPN 是用来索引下一级页表的内存位置</font>
>

**<font style="color:#000000;">下图是一个真正的RISC-V page table结构和硬件实现。</font>**

**<font style="color:#000000;">我们之前提到的虚拟内存地址中的27bit的index，实际上是由3个9bit的数字组成（L2，L1，L0）。</font>**

1. **<font style="color:#000000;">前9个bit被用来索引最高级的page directory（注：通常page directory是用来索引page table或者其他page directory物理地址的表单，但是在课程中，page table，page directory， page directory table区分并不明显，可以都认为是有相同结构的地址对应表单）。</font>**
2. **<font style="color:#000000;">一个directory是4096Bytes，就跟page的大小是一样的。Directory中的一个条目被称为PTE（Page Table Entry）是64bits，就像寄存器的大小一样，也就是8Bytes。所以一个Directory page有512个 PTE。</font>**
3. **<font style="color:#000000;">所以实际上，SATP寄存器会指向最高一级的page directory的物理内存地址，之后我们用虚拟内存中index的高9bit用来索引最高一级的page directory(注，2^9 = 512，正好可以索引到一条 PTE)，这样我们就能得到一个PPN，也就是物理page号。</font>****<font style="color:#000000;background-color:#FBDE28;">这个PPN指向了中间级的页表 page directory 的位置。</font>**

**<font style="color:#000000;">当我们在使用中间级的page directory时，我们通过虚拟内存地址中的L1部分完成索引。</font>**

**<font style="color:#000000;">接下来会走到最低级的page directory，我们通过虚拟内存地址中的L0部分完成索引。</font>**

**<font style="color:#000000;">在最低级的page directory中，我们可以得到对应于虚拟内存地址的物理内存地址。</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/cf095262d3ed2d0e3f0b1f22de8043de.png)

+ <font style="color:#000000;">比较</font>

<font style="color:#000000;">从某种程度上来说，与之前一种方案还是很相似的，除了实际的索引是由3步，而不是1步完成。这种方式的主要优点是，如果地址空间中大部分地址都没有使用，你不必为每一个index准备一个条目。</font>

<font style="color:#000000;">举个例子，如果你的地址空间只使用了一个page，4096Bytes。</font>

1. <font style="color:#000000;">在最高级，你需要一个page directory。在这个page directory中，你需要一个数字是0的PTE，指向中间级page directory。所以在中间级，你也需要一个page directory，里面也是一个数字0的PTE，指向最低级page directory。所以这里总共需要3个page directory（也就是3 * 512个条目，一个条目 64bit）。</font>
2. <font style="color:#000000;">而在前一个方案中，虽然我们只使用了一个page，还是需要2^27个PTE（注，约 1GB 内存）。</font>
3. <font style="color:#000000;">这个方案中，我们只需要3 * 512个PTE（注，12KB 内存）。所需的空间大大减少了。这是实际上硬件采用这种层次化的3级page directory结构的主要原因。</font>

#### <font style="color:#000000;">标志位</font>
<font style="color:#000000;">接下来，让我们看看PTE中的Flag，因为它也很重要。每个PTE的低10bit是一堆标志位：</font>

+ <font style="color:#000000;">第一个标志位是Valid。如果Valid bit位为1，那么表明这是一条合法的PTE，你可以用它来做地址翻译。对于刚刚举得那个小例子（注，应用程序只用了1个page的例子），我们只使用了3个page directory，每个page directory中只有第0个PTE被使用了，所以只有第0个PTE的Valid bit位会被设置成1，其他的511个PTE的Valid bit为0。这个标志位告诉MMU，你不能使用这条PTE，因为这条PTE并不包含有用的信息。</font>
+ <font style="color:#000000;">下两个标志位分别是Readable和Writable。表明你是否可以读/写这个page。</font>
+ <font style="color:#000000;">Executable表明你可以从这个page执行指令。</font>
+ <font style="color:#000000;">User表明这个page可以被运行在用户空间的进程访问。</font>
+ <font style="color:#000000;">其他标志位并不是那么重要，他们偶尔会出现，前面5个是重要的标志位。</font>

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/df61cd9859e812df312c2da3ec586678.jpeg)

#### <font style="color:#000000;">RISC-V</font><font style="color:#000000;">硬件设计</font>
+ **<font style="color:#000000;">虚拟内存地址只使用了 39 位</font>**

<font style="color:#000000;">有关RISC-V的一件有意思的事情是：</font>**<font style="color:#000000;">虚拟内存地址都是64bit，因为RISC-V的寄存器是64bit的</font>**<font style="color:#000000;">。实际上，我们使用的RSIC-V处理器上，并不是所有的64bit都被使用了，高25bit并没有被使用。这样的结果是限制了虚拟内存地址的数量，</font>**<font style="color:#000000;">虚拟内存地址的数量现在只有2^39个，大概是512GB</font>**<font style="color:#000000;">。当然，如果必要的话，最新的处理器或许可以支持更大的地址空间，只需要将未使用的25bit拿出来做为虚拟内存地址的一部分即可。</font>

<font style="color:#000000;">在剩下的39bit中，有27bit被用来当做index，12bit被用来当做offset。offset必须是12bit，因为对应了一个page的4096个字节。</font>

+ <font style="color:#000000;">物理内存地址使用了 56 位</font>

<font style="color:#000000;">在RISC-V中，物理内存地址是56bit。所以物理内存可以大于单个虚拟内存地址空间，但是也最多到2^56。大多数主板还不支持2^56这么大的物理内存，但是原则上，如果你能造出这样的主板，那么最多可以支持2^56字节的物理内存。</font>

<font style="color:#000000;">物理内存地址是56bit，其中44bit是物理page号（PPN，Physical Page Number），剩下12bit是offset完全继承自虚拟内存地址（也就是地址转换时，只需要将虚拟内存中的27bit翻译成物理内存中的44bit的page号，剩下的12bitoffset直接拷贝过来即可）。</font>

### <font style="color:#000000;">页表缓存（Translation Lookaside Buffer）</font>
**<font style="color:#000000;">每次处理器从内存加载或者存储数据时，基本上都要做3次内存查找，第一次在最高级的page directory，第二次在中间级的page directory，最后一次在最低级的page directory。这里代价是非常高的。</font>**

> **<font style="color:#000000;">所以实际中，几乎所有的处理器都会对最近使用过的虚拟地址的翻译结果进行缓存。</font>**
>
> **<font style="color:#000000;">这个缓存被称为：Translation Lookside Buffer（通常翻译成页表缓存）。你会经常看到它的缩写TLB。一般来说，这就是页表 Page Table Entry的缓存</font>**
>

**<font style="color:#000000;">当处理器第一次查找一个虚拟地址时，硬件通过3级page table得到最终的PPN，TLB会保存虚拟地址到物理地址的映射关系。这样下一次当你访问同一个虚拟地址时，处理器可以查看TLB，TLB会直接返回物理地址，而不需要通过page table得到结果。</font>**

> + **<font style="color:#000000;">注意</font>**
> 1. **<font style="color:#000000;">如果你切换了page table，TLB中的缓存将不再有用，它们需要被清空，否则地址翻译可能会出错。所以操作系统知道TLB是存在的，但只会时不时的告诉操作系统，现在的TLB不能用了，因为要切换page table了。在RISC-V中，清空TLB的指令是sfence_vma。</font>**
> 2. **<font style="color:#000000;">3级的page table是由硬件实现的，所以3级 page table的查找都发生在硬件中。MMU是硬件的一部分而不是操作系统的一部分。</font>**
>

> <font style="color:#000000;">RISC-V处理器中的MMU（Memory Management Unit）与TLB都位于每个CPU核内部。</font>
>
> **<font style="color:#000000;">这里的关键点在于，某些缓存（Cache）是基于虚拟地址索引的，而某些则是基于物理地址索引的。</font>**
>
> 1. **<font style="color:#000000;">基于虚拟地址索引的Cache</font>**<font style="color:#000000;">：</font>**<font style="color:#000000;background-color:#FBDE28;">这类缓存位于MMU之前。</font>**<font style="color:#000000;">即CPU会先查看这类缓存，看是否可以直接获取数据。如果在这类缓存中找到了数据，CPU可以直接使用这些数据，无需进行地址翻译。如果未找到，才会进入MMU进行虚拟到物理的地址翻译。</font>
> 2. **<font style="color:#000000;">基于物理地址索引的Cache</font>**<font style="color:#000000;">：</font>**<font style="color:#000000;background-color:#FBDE28;">这类缓存位于MMU之后。</font>**<font style="color:#000000;">这意味着CPU首先需要通过MMU将虚拟地址转换为物理地址，然后再使用这个物理地址去查询基于物理地址索引的缓存。</font>
>

### <font style="color:#000000;">Kernel Page Table</font>
**<font style="color:#000000;">接下来，我们看一下在XV6中，page table是如何工作的？</font>**

**<font style="color:#000000;">首先我们来看一下kernel page的分布。</font>**

**<font style="color:#000000;">下图就是内核中地址的对应关系，左边是内核的虚拟地址空间，右边上半部分是物理内存或者说是DRAM，右边下半部分是I/O设备。接下来我会首先介绍右半部分，然后再介绍左半部分。</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/071cd924a12937ad3269179253bb6b2a.jpeg)

#### <font style="color:#000000;">硬件设计</font>
**<font style="color:#000000;">图中的右半部分的结构完全由硬件设计者决定。如你们上节课看到的一样，当操作系统启动时，会从地址0x80000000开始运行，这个地址其实也是由硬件设计者决定的。具体的来说，如果你们看一个主板，中间是RISC-V处理器，我们现在知道了处理器中有4个核，每个核都有自己的MMU和TLB。处理器旁边就是DRAM芯片。</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/b46196db2b703d3cc557d9ff17c5aa4c.jpeg)

**<font style="color:#000000;">主板的设计人员决定了，在完成了虚拟到物理地址的翻译之后，如果得到的物理地址大于0x80000000会走向DRAM芯片，如果得到的物理地址低于0x80000000会走向不同的I/O设备。这是由这个主板的设计人员决定的物理结构。如果你想要查看这里的物理结构，你可以阅读主板的手册，手册中会一一介绍物理地址对应关系。</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/28104bde5163149e6d8eb98e0e7de286.jpeg)![](https://raw.githubusercontent.com/ScuDays/MyImg/master/3b007bab5c013ec6a08a6c4532ab5614.jpeg)

**<font style="color:#000000;">首先，地址0是保留的，地址0x10090000对应以太网，地址0x80000000对应DDR内存，处理器外的易失存储（Off-Chip Volatile Memory），也就是主板上的DRAM芯片。所以，在你们的脑海里应该要记住这张主板的图片，即使我们接下来会基于你们都知道的C语言程序---QEMU来做介绍，但是最终所有的事情都是由主板硬件决定的。</font>**

<font style="color:#000000;">学生提问：当你说这里是由硬件决定的，硬件是特指CPU还是说CPU所在的主板？</font>

<font style="color:#000000;">Frans教授：CPU所在的主板。CPU只是主板的一小部分，DRAM芯片位于处理器之外。是主板设计者将处理器，DRAM和许多I/O设备汇总在一起。对于一个操作系统来说，CPU只是一个部分，I/O设备同样也很重要。所以当你在写一个操作系统时，你需要同时处理CPU和I/O设备，比如你需要向互联网发送一个报文，操作系统需要调用网卡驱动和网卡来实际完成这个工作。</font>

#### <font style="color:#000000;">内核页表</font>
**<font style="color:#000000;">回到最初那张图的右侧：物理地址的分布。</font>**

**<font style="color:#000000;">最下面是未被使用的地址，这与主板文档内容是一致的（地址为0）。</font>**

**<font style="color:#000000;">地址0x1000是boot ROM的物理地址，当你对主板上电，主板做的第一件事情就是运行存储在boot ROM中的代码，当boot完成之后，会跳转到地址0x80000000，操作系统需要确保在地址0x80000000有一些数据（代码）能够继续启动操作系统。</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/9d3bb8872d91c43ce29e6986ecd4ca33.jpeg)

**<font style="color:#000000;">这里还有一些其他的I/O设备：</font>**

+ **<font style="color:#000000;">PLIC是中断控制器（Platform-Level Interrupt Controller）我们下周的课会讲。</font>**
+ **<font style="color:#000000;">CLINT（Core Local Interruptor）也是中断的一部分。所以多个设备都能产生中断，需要中断控制器来将这些中断路由到合适的处理函数。</font>**
+ **<font style="color:#000000;">UART0（Universal Asynchronous Receiver/Transmitter）负责与Console和显示器交互。</font>**
+ **<font style="color:#000000;">VIRTIO disk，与磁盘进行交互。</font>**

**<font style="color:#000000;">地址0x02000000对应CLINT，当你向这个地址执行读写指令，你是向实现了CLINT的芯片执行读写。这里你可以认为你直接在与设备交互，而不是读写物理内存。</font>**

> **<font style="color:#000000;">学生提问：确认一下，低于0x80000000的物理地址，不存在于DRAM中，当我们在使用这些地址的时候，指令会直接走向其他的硬件，对吗？</font>**
>
> **<font style="color:#000000;">Frans教授：是的。高于0x80000000的物理地址对应DRAM芯片，但是对于例如以太网接口，也有一个特定的低于0x80000000的物理地址，我们可以对这个叫做内存映射I/O（Memory-mapped I/O）的地址执行读写指令，来完成设备的操作。</font>**
>
> **<font style="color:#000000;">学生提问：为什么物理地址最上面一大块标为未被使用？</font>**
>
> **<font style="color:#000000;">Frans教授：物理地址总共有2^56那么多，但是你不用在主板上接入那么多的内存。所以不论主板上有多少DRAM芯片，总是会有一部分物理地址没有被用到。实际上在XV6中，我们限制了内存的大小是128MB。</font>**
>
> **<font style="color:#000000;">学生提问：当读指令从CPU发出后，它是怎么路由到正确的I/O设备的？比如说，当CPU要发出指令时，它可以发现现在地址是低于0x80000000，但是它怎么将指令送到正确的I/O设备？</font>**
>
> **<font style="color:#000000;">Frans教授：你可以认为在RISC-V中有一个多路输出选择器（demultiplexer）。</font>**
>

**<font style="color:#000000;">接下来我会切换到第一张图的左边，这就是XV6的虚拟内存地址空间。</font>**

**<font style="color:#000000;">当机器刚刚启动时，还没有可用的page，XV6操作系统会设置好内核使用的虚拟地址空间，也就是这张图左边的地址分布。</font>**

**<font style="color:#000000;">因为我们想让XV6尽可能的简单易懂，所以内核的虚拟地址到物理地址的映射，大部分是相等的关系。</font>**

**<font style="color:#000000;">比如说内核会按照这种方式设置page table，虚拟地址0x02000000对应物理地址0x02000000。这意味着左侧低于PHYSTOP的虚拟地址，与右侧使用的物理地址是一样的。</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/2ef6af6b5d68f461f506e0da6d5fdcae.jpeg)

**<font style="color:#000000;">所以，这里的箭头都是水平的，因为这里是完全相等的映射。</font>**

**<font style="color:#000000;">除此之外，这里还有两件重要的事情：</font>**

1. **<font style="color:#000000;">第一件事情是，有一些page在虚拟内存中的地址很靠后，比如kernel stack在虚拟内存中的地址就很靠后。这是因为在它之下有一个未被映射的Guard page，这个Guard page对应的PTE的Valid 标志位没有设置，这样，如果kernel stack耗尽了，它会溢出到Guard page，但是因为Guard page的PTE中Valid标志位未设置，会导致立即触发page fault，这样的结果好过内存越界之后造成的数据混乱。立即触发一个panic（也就是page fault），你就知道kernel stack出错了。同时我们也又不想浪费物理内存给Guard page，所以Guard page不会映射到任何物理内存，它只是占据了虚拟地址空间的一段靠后的地址。</font>**

**<font style="color:#000000;">同时，kernel stack被映射了两次，在靠后的虚拟地址映射了一次，在PHYSTOP下的Kernel data中又映射了一次，但是实际使用的时候用的是上面的部分，因为有Guard page会更加安全。</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/d08ee996ccad19f887b128177e1fdf46.jpeg)

**<font style="color:#000000;">这是众多你可以通过page table实现的有意思的事情之一。</font>**

**<font style="color:#000000;">你可以向同一个物理地址映射两个虚拟地址，你可以不将一个虚拟地址映射到物理地址。</font>**

**<font style="color:#000000;">可以是一对一的映射，一对多映射，多对一映射。XV6至少在1-2个地方用到类似的技巧。这的kernel stack和Guard page就是XV6基于page table使用的有趣技巧的一个例子。</font>**

2. **<font style="color:#000000;">第二件事情是权限。例如Kernel text page被标位R-X，意味着你可以读它，也可以在这个地址段执行指令，但是你不能向Kernel text写数据。通过设置权限我们可以尽早的发现Bug从而避免Bug。对于Kernel data需要能被写入，所以它的标志位是RW-，但是你不能在这个地址段运行指令，所以它的X标志位未被设置。</font>**

**<font style="color:#000000;">（注，所以，kernel text用来存代码，代码可以读，可以运行，但是不能篡改，kernel data用来存数据，数据可以读写，但是不能通过数据伪装代码在kernel中运行）</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/3fdb9d8bc6f055e50cc742b2c2d375ff.jpeg)

> **<font style="color:#000000;">学生提问：对于不同的进程会有不同的kernel stack吗？</font>**
>
> **<font style="color:#000000;">Frans：答案是的。每一个用户进程都有一个对应的kernel stack</font>**
>

**<font style="color:#000000;"></font>**

### <font style="color:#000000;">用户页表</font>
> **<font style="color:#000000;">学生提问：用户程序的虚拟内存会映射到未使用的物理地址空间吗？</font>**
>
> **<font style="color:#000000;">Frans教授：在kernel page table中，有一段Free Memory，它对应了物理内存中的一段地址。</font>**
>
> ![](https://raw.githubusercontent.com/ScuDays/MyImg/master/fca2715c3429cefa77ac0eccea153beb.jpeg)
>
> **<font style="color:#000000;">XV6使用这段free memory来存放用户进程的page table，text和data。如果我们运行了非常多的用户进程，某个时间点我们会耗尽这段内存，这个时候fork或者exec会返回错误。</font>**
>

> **<font style="color:#000000;">同一个学生提问：这就意味着，用户进程的虚拟地址空间会比内核的虚拟地址空间小的多，是吗？</font>**
>
> **<font style="color:#000000;">Frans教授：本质上来说，两边的虚拟地址空间大小是一样的。但是用户进程的虚拟地址空间使用率会更低。</font>**
>

> **<font style="color:#000000;">学生提问：如果多个进程都将内存映射到了同一个物理位置，这里会优化合并到同一个地址吗？</font>**
>
> **<font style="color:#000000;">Frans教授：XV6不会做这样的事情，但是page table实验中有一部分就是做这个事情。真正的操作系统会做这样的工作。当你们完成了page table实验，你们就会对这些内容更加了解。</font>**
>

> **<font style="color:#000000;">学生提问：每个进程都会有自己的3级树状page table，通过这个page table将虚拟地址翻译成物理地址。所以看起来当我们将内核虚拟地址翻译成物理地址时，我们并不需要kernel的page table，因为进程会使用自己的树状page table并完成地址翻译（注，不太理解这个问题点在哪）。</font>**
>
> **<font style="color:#000000;">Frans教授：当kernel创建了一个进程，针对这个进程的page table也会从Free memory中分配出来。内核会为用户进程的page table分配几个page，并填入PTE。在某个时间点，当内核运行了这个进程，内核会将进程的根page table的地址加载到SATP中。从那个时间点开始，处理器会使用内核为那个进程构建的虚拟地址空间。</font>**
>
> **<font style="color:#000000;">同一个学生提问：所以内核为进程放弃了一些自己的内存，但是进程的虚拟地址空间理论上与内核的虚拟地址空间一样大，虽然实际中肯定不会这么大。</font>**
>
> **<font style="color:#000000;">Frans教授：是的，下图是用户进程的虚拟地址空间分布，与内核地址空间一样，它也是从0到MAXVA。</font>**
>

<font style="color:#000000;">（</font>**<font style="color:#000000;">用户进程的虚拟地址空间分布</font>**<font style="color:#000000;">）</font>

![用户进程的虚拟地址空间分布（用户页表）​​​​​​](https://raw.githubusercontent.com/ScuDays/MyImg/master/5e3d95bf4363af0ed5c1f04cf38b26a5.jpeg)

> **<font style="color:#000000;">它有由内核设置好的，专属于进程的page table来完成地址翻译。</font>**
>
> **<font style="color:#000000;">学生提问：但是我们不能将所有的MAXVA地址都使用吧？</font>**
>
> **<font style="color:#000000;">Frans教授：是的我们不能，这样我们会耗尽内存。大多数的进程使用的内存都远远小于虚拟地址空间。</font>**
>

<font style="color:#000000;"></font>


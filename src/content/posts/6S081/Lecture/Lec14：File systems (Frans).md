---
title: Lec14：File systems (Frans)
date: 2024-12-22 00:39:59
modify: 2024-12-22 16:41:11
author: days
category: 6S081
published: 2024-12-22
---
# Lec14：File systems (Frans)
## 14.1 Why Interesting 
**接下来的课程将帮助我们理解文件系统的内部工作原理，这是一个令人兴奋的话题，因为我们日常都在使用它。我们将探讨几个关键点：**

1. **硬件抽象****：了解文件系统如何对硬件进行抽象处理。**
2. **崩溃安全（Crash Safety）****：即使在计算机意外关机后，也能保证文件系统的完整性和数据不丢失。这非常重要，将在下一节课中详细介绍。**
3. **磁盘上的布局****：学习如何组织目录和文件等信息在磁盘上存储，确保重启后数据可恢复。XV6操作系统提供了一个简化的示例来帮助教学，而实际的文件系统会更复杂。**
4. **性能优化****：鉴于磁盘访问速度较慢，通过缓冲区缓存和其他技术提高效率，并讨论如何支持并发操作以加快文件查找速度。**

**这些内容旨在深入揭示文件系统的设计与实现背后的逻辑。**

## **<font style="color:rgb(38, 38, 38);">14.2 File system实现概述</font>**
### 文件相关系统调用
**我们看一下一些与文件系统相关的基础系统调用。**

**首先让我们来看一个简单的场景，假设我们创建了文件“x/y”，或者说在目录x中创建了文件y，同时我们需要提供一些标志位，现在我们还不太关心标志位所以我会忽略它。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRbYhXPDgebPttv0nDl%252F-MRbgWSrZywz5d50HWcB%252Fimage.png%3Falt%3Dmedia%26token%3D1579c247-dfbc-4129-8d24-15409a1f4bf3&width=768&dpr=4&quality=100&sign=9600ee00&sv=1)

**上面的系统调用会创建文件，并返回****文件描述符****给调用者。调用者也就是用户应用程序可以对文件描述符调用**`**write**`**，有关**`**write**`**我们在之前已经看过很多次了，这里我们向文件写入“abc”三个字符。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRbYhXPDgebPttv0nDl%252F-MRbgz5RD4342hUO8snB%252Fimage.png%3Falt%3Dmedia%26token%3Df2f61739-f482-413b-9567-84a36ec9e79d&width=768&dpr=4&quality=100&sign=ec2f7363&sv=1)

**从这两个调用已经可以看出一些信息了：**

+ **接口中的路径名是用户自选的可读字符串，而非数字。**
+ `**write**`**系统调用不直接使用偏移量（offset）作为参数。文件写入的位置由文件系统内部管理。如果再次调用**`**write**`**，新数据将从当前偏移量位置开始写入，例如从第4个字节开始。**

**除此之外，还有一些有趣的系统调用。**

**例如XV6和所有的Unix文件系统都支持通过系统调用创建链接，给同一个文件指定多个名字。你可以通过调用**`**link**`**系统调用，为之前创建的文件“x/y”创建另一个名字“x/z”。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRhBFGrbi6iZo-luZ0H%252F-MRhYA3DAQtfA0iK7k1D%252Fimage.png%3Falt%3Dmedia%26token%3Dcd47338c-c53a-4470-863a-d74b3203e34a&width=768&dpr=4&quality=100&sign=9037877c&sv=1)

+ **所以文件系统内部需要以某种方式跟踪指向同一个文件的多个文件名。**

**我们还可能会在文件打开时，删除或者更新文件的命名空间。**

**例如，用户可以通过unlink系统调用来删除特定的文件名。如果此时相应的文件描述符还是打开的状态，那我们还可以向文件写数据，并且这也能正常工作。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRhBFGrbi6iZo-luZ0H%252F-MRhaQ8fqCEkHhyAsyyE%252Fimage.png%3Falt%3Dmedia%26token%3D849f919d-ce84-41d7-ab37-7eccf666c749&width=768&dpr=4&quality=100&sign=4ea4f399&sv=1)

### 底层使用 inode 实现
**在文件系统中，文件描述符与特定的文件对象关联，而不是文件名。因此，即使文件名改变，文件描述符依然可以指向同一个文件对象。这意味着操作系统内部使用了一种与文件名无关的方式来表示文件。**

+ **接下来我们看一下文件系统的结构。文件系统究竟维护了什么样的结构来实现前面介绍的API呢？**

**inode是文件系统中的一个核心对象，用于代表文件且不依赖于文件名。**

+ **每个inode通过唯一的整数编号来标识。文件系统使用这个编号而非文件路径来引用inode。**
+ **inode具有链接计数(link count)，记录有多少个文件名指向它。**
+ **此外，还有一个打开的文件描述符计数(openfd count)。只有当这两个计数都为0时，相应的inode（即文件）才能被删除。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRhBFGrbi6iZo-luZ0H%252F-MRhp9HXTxMwzPdQ0cPF%252Fimage.png%3Falt%3Dmedia%26token%3D9d2519a3-98fd-4f53-948a-cf80136c9b7b&width=768&dpr=4&quality=100&sign=917b1c47&sv=1)

**同时基于之前的讨论，我们也知道write和read都没有针对文件的offset参数，所以文件描述符必然自己悄悄维护了对于文件的offset。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRhBFGrbi6iZo-luZ0H%252F-MRhqFE_iWtbg2tZCp_9%252Fimage.png%3Falt%3Dmedia%26token%3D77fc7cd9-818c-41e6-85a3-d02f034a1898&width=768&dpr=4&quality=100&sign=93daf97d&sv=1)

**文件系统的核心数据结构包括inode和文件描述符，其中文件描述符主要用于与用户进程交互。尽管不同文件系统的API可能相似但内部实现差异大，它们通常共享一些基本结构。为了更好地理解这一复杂体系，可以将其分为几个层次来看待：**

+ ******磁盘或存储设备，提供持久化存储。**
+ ******Buffer Cache/Block Cache：减少对磁盘的直接访问次数，通过将常用数据保留在内存中来加速读写操作。**
+ **Logging Layer（日志层）：确保数据更改的一致性和可恢复性。**
+ **Inode Cache（仅在XV6中提到）：用于同步操作，提高性能。由于单个inode较小，多个inode常被打包进一个磁盘块中；XV6维护了一个inode缓存以支持针对单个inode的操作。**
+ ******Inodes：负责实现文件的基本读写功能。**
+ **文件名及文件描述符：用于管理和操作文件。**

**这种分层设计有助于简化对整个文件系统架构的理解。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRhBFGrbi6iZo-luZ0H%252F-MRhtSv2iQvU3nu1K7ZF%252Fimage.png%3Falt%3Dmedia%26token%3Dbe934984-d1c5-4fbc-9618-21eb6b6f3373&width=768&dpr=4&quality=100&sign=66876202&sv=1)

****

## 14.3 How file system uses disk 
**接下来，我将简单的介绍最底层，也即是存储设备。实际中有非常非常多不同类型的存储设备，这些设备的区别在于性能，容量，数据保存的期限等。其中两种最常见，并且你们应该也挺熟悉的是SSD和HDD。这两类存储虽然有着不同的性能，但是都在合理的成本上提供了大量的存储空间。SSD通常是0.1到1毫秒的访问时间，而HDD通常是在10毫秒量级完成读写一个disk block。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRhBFGrbi6iZo-luZ0H%252F-MRhwVTjKW_rn0q0Vw2v%252Fimage.png%3Falt%3Dmedia%26token%3D41ff6f60-9774-42bd-ad6d-df81660b47db&width=768&dpr=4&quality=100&sign=d47b042c&sv=1)

**这里有些术语有点让人困惑，它们是sectors和blocks。**

+ **sector通常是磁盘驱动可以读写的最小单元，它过去通常是512字节。**
+ **block通常是操作系统或者文件系统视角的数据。它由文件系统定义，在XV6中它是1024字节。所以XV6中一个block对应两个sector。通常来说一个block对应了一个或者多个sector。**



**有的时候，人们也将磁盘上的sector称为block。所以这里的术语也不是很精确。**

**这些存储设备连接到了电脑总线之上，总线也连接了CPU和内存。一个文件系统运行在CPU上，将内部的数据存储在内存，同时也会以读写block的形式存储在SSD或者HDD。这里的接口还是挺简单的，包括了read/write，然后以block编号作为参数。虽然我们这里描述的过于简单了，但是实际的接口大概就是这样。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRhBFGrbi6iZo-luZ0H%252F-MRhy7Cd_NccmqjQhB8S%252Fimage.png%3Falt%3Dmedia%26token%3D7cc0655d-df6a-4d7b-9283-a4953d3f105a&width=768&dpr=4&quality=100&sign=188fb288&sv=1)

**在内部，SSD和HDD工作方式完全不一样，但是对于硬件的抽象屏蔽了这些差异。磁盘驱动通常会使用一些标准的协议，例如PCIE，与磁盘交互。从上向下看磁盘驱动的接口，大部分的磁盘看起来都一样，你可以提供block编号，在驱动中通过写设备的控制寄存器，然后设备就会完成相应的工作。这是从一个文件系统的角度的描述。尽管不同的存储设备有着非常不一样的属性，从驱动的角度来看，你可以以大致相同的方式对它们进行编程。**

**有关存储设备我们就说这么多。**

**从文件系统的角度来看磁盘还是很直观的。因为对于磁盘就是读写block或者sector，我们可以将磁盘看作是一个巨大的block的数组，数组从0开始，一直增长到磁盘的最后。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRhzbAZwhuzp63wWdRE%252F-MRibTsYtaP0N-PN_5wB%252Fimage.png%3Falt%3Dmedia%26token%3D22b056b7-2a33-44ac-8cdc-f684845ffad3&width=768&dpr=4&quality=100&sign=53484414&sv=1)

**文件系统负责以一种方式将数据存储在磁盘上，以便在重启后能够重建。XV6采用了一种简单但常见的布局结构：**

**注：一个 block 大小为 1024 字节**

+ **Block 0****：通常未使用或作为启动扇区。**
+ **Block 1 (超级块)****：描述了整个文件系统，包括文件系统的大小等信息。XV6的超级块中还包含了更多细节，使得大部分文件系统信息可以从这里获取。**
+ **Block 2 到 Block 32****：用于存放日志，其具体大小（在XV6中定义为30个block）也在超级块中指定。**
+ **Block 32 到 Block 45****：这些区块用来存储inode，每个inode占用64字节，并且多个inode可以打包在一个block里。**
+ **一个Bitmap Block****：紧跟在inode之后，仅占一个block，用于标记哪些数据块是空闲状态。**
+ **剩余部分****：全部作为数据块，用于存储实际的文件和目录内容。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRhzbAZwhuzp63wWdRE%252F-MRielGcbrHOzPCrxHcO%252Fimage.png%3Falt%3Dmedia%26token%3Df685aafe-7c22-4965-9936-d811b090023d&width=768&dpr=4&quality=100&sign=aa7907e3&sv=1)

**通常来说，bitmap block，inode blocks和log blocks被统称为metadata block。它们虽然不存储实际的数据，但是它们存储了能帮助文件系统完成工作的元数据。**

> **学生提问：boot block是不是包含了操作系统启动的代码？**
>
> **Frans教授：完全正确，它里面通常包含了足够启动操作系统的代码。之后再从文件系统中加载操作系统的更多内容。**
>
> **学生提问：所以XV6是存储在虚拟磁盘上？**
>
> **Frans教授：在QEMU中，我们实际上走了捷径。QEMU中有个标志位-kernel，它指向了内核的镜像文件，QEMU会将这个镜像的内容加载到了物理内存的0x80000000。所以当我们使用QEMU时，我们不需要考虑boot sector。**
>
> **学生提问：所以当你运行QEMU时，你就是将程序通过命令行传入，然后直接就运行传入的程序，然后就不需要从虚拟磁盘上读取数据了？**
>
> **Frans教授：完全正确。**
>

**假设inode是64字节，如果你想要读取inode10，那么你应该按照下面的公式去对应的block读取inode。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRhzbAZwhuzp63wWdRE%252F-MRilKFT6Oc49iaZe8JW%252Fimage.png%3Falt%3Dmedia%26token%3D973f5906-9995-44f3-a5ab-17ea56e58e0e&width=768&dpr=4&quality=100&sign=ba4af0ad&sv=1)

**所以inode0在block32，inode17会在block33。只要有inode的编号，我们总是可以找到inode在磁盘上存储的位置。**

****

## 14.4.1 inode
**磁盘上的inode是一种****<font style="color:#DF2A3F;background-color:#FBDE28;">64字节</font>****的数据结构，主要包含以下信息：**

+ **type**** 字段：标识inode代表的是文件还是目录。**
+ **nlink**** 字段：记录指向该inode的链接数。**
+ **size**** 字段：指示文件数据的实际大小（以字节为单位）。**
+ **block编号****：XV6系统中，inode内含有12个直接块编号（direct block numbers），用于指向文件的前12个数据块。如果文件非常小，比如只有几个字节，则可能仅使用第一个块编号来定位这些数据所在的位置。**
+ **间接块编号**** (indirect block number)：第13个位置存放了一个特殊的块编号，这个编号指向另一个存储了256个额外块编号的块，从而支持更大的文件。****注：有点像多级页表的感觉**

**通过这种方式，inode有效地组织和管理着文件或目录的具体内容。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRhzbAZwhuzp63wWdRE%252F-MRiq3PDZ1MKm5xRPATf%252Fimage.png%3Falt%3Dmedia%26token%3Db690c6fe-e665-4ded-adc7-91be326015d0&width=768&dpr=4&quality=100&sign=3a2815c8&sv=1)

**以上基本就是XV6中inode的组成部分。**

**基于上面的内容，XV6中文件最大的长度是多少呢？**

> **学生回答：会是268*********1024字节**
>

**是的，最大文件尺寸对应的是下面的公式。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRiqHd8klcdJiYeRvr7%252F-MRj6v153sUes_fzLr6w%252Fimage.png%3Falt%3Dmedia%26token%3D2ac667a8-c0bd-4c3c-a1c1-15f27ab33b5c&width=768&dpr=4&quality=100&sign=89ea6c2a&sv=1)

**可以算出这里就是268KB，这是个很小的文件长度，实际的文件系统，文件最大的长度会大的多得多。**

+ **那可以做一些什么来让文件系统支持大得多的文件呢？**

> **学生回答：可以扩展inode中indirect部分吗？**
>

**是的，可以用类似page table的方式，构建一个双重indirect block number指向一个block，这个block中再包含了256个indirect block number，每一个又指向了包含256个block number的block。这样的话，最大的文件长度会大得多（注，是256*256*1K）。**

**这里修改了inode的数据结构，你可以使用类似page table的树状结构，也可以按照B树或者其他更复杂的树结构实现。XV6这里极其简单，基本是按照最早的Uinx实现方式来的，不过你可以实现更复杂的结构。实际上，在接下来的File system lab中，你将会实现双重indirect block number来支持更大的文件。**

> **学生提问：为什么每个block存储256个block编号？**
>
> **Frans教授：因为每个编号是4个字节。1024/4 = 256。这又带出了一个问题，如果block编号只是4个字节，磁盘最大能有多大？是的，2的32次方（注，4TB）。有些磁盘比这个数字要大，所以通常人们会使用比32bit更长的数字来表示block编号。**
>

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRiqHd8klcdJiYeRvr7%252F-MRjBxFR9NYeTXGprwEZ%252Fimage.png%3Falt%3Dmedia%26token%3D1c4a29e0-51ee-46ae-80f4-5eefd1da7d89&width=768&dpr=4&quality=100&sign=d3bd2387&sv=1)

**接下来，我们想要实现read系统调用。假设我们需要读取文件的第8000个字节，那么你该读取哪个block呢？从inode的数据结构中该如何计算呢？**

> **为了读取文件的第8000个字节，首先需要确定它位于哪个block中。给定每个block大小为1024字节：**
>
> + **用8000除以1024得到7（向下取整），意味着目标字节位于第7个block。**
> + **因此，直接从inode的direct block指针中找到对应的第7个block即可定位到所需数据块。**
> + **为进一步精确到具体位置，使用8000对1024取余数，结果是832，这表示在该block内的偏移量。  
****综上所述，为了访问第8000个字节，系统通过inode找到第7个direct block，并在其内偏移832处读取数据。**
>

**总结一下，inode中的信息完全足够用来实现read/write系统调用，至少可以找到哪个disk block需要用来执行read/write系统调用。**

---

## 14.4.2 目录**（directory）**
**接下来我们讨论一下目录（directory）。文件系统的酷炫特性就是层次化的命名空间（hierarchical namespace），你可以在文件系统中保存对用户友好的文件名。大部分Unix文件系统有趣的点在于，一个目录本质上是一个文件加上一些文件系统能够理解的结构。**

**在XV6中，这里的结构极其简单。**

**每一个目录包含了directory entries，每一条entry有固定的格式：**

+ **前2个字节包含了目录中文件或者子目录的inode编号，**
+ **接下来的14个字节包含了文件或者子目录名。**

**所以每个entry总共是16个字节。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRiqHd8klcdJiYeRvr7%252F-MRjJHrfQCURA-qgeXJN%252Fimage.png%3Falt%3Dmedia%26token%3D6c7a7330-c2ea-4c6b-93d4-7a64f2f7b489&width=768&dpr=4&quality=100&sign=9f5b36bf&sv=1)

**对于实现路径名查找，这里的信息就足够了。**

+ **假设我们要查找路径名“/y/x”，我们该怎么做呢？**
1. **从路径名我们知道，应该从root inode开始查找。**
2. **通常root inode会有固定的inode编号，在XV6中，这个编号是1。**
3. **我们该如何根据编号找到root inode呢？从前一节我们可以知道，inode从block 32开始，如果是inode1，那么必然在block 32中的64到128字节的位置。（inode 大小为 64 字节）**
4. **所以文件系统可以直接读到root inode的内容。**
5. **对于路径名查找程序，接下来就是扫描root inode包含的所有block，以找到“y”。**
6. **该怎么找到root inode所有对应的block呢？根据前一节的内容就是读取所有的direct block number和indirect block number。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRiqHd8klcdJiYeRvr7%252F-MRjIubPsddAtCtXSzAK%252Fimage.png%3Falt%3Dmedia%26token%3Dc09f156e-ac55-41a2-8d3c-0120ce2e08f3&width=768&dpr=4&quality=100&sign=7c7f1db7&sv=1)

**结果可能是找到了，也可能是没有找到。如果找到了，那么目录y也会有一个inode编号，假设是251，**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRiqHd8klcdJiYeRvr7%252F-MRjJA-NSuo7kriDi_GY%252Fimage.png%3Falt%3Dmedia%26token%3D21783395-5420-471f-a8dc-c97d5124fcf1&width=768&dpr=4&quality=100&sign=6c7180d7&sv=1)

**我们可以继续从**`**inode 251**`**查找，先读取**`**inode 251**`**的内容，之后再扫描**`**inode**`**所有对应的**`**block**`**，找到“x”并得到文件x对应的inode编号，最后将其作为路径名查找的结果返回。**

> **学生提问：有没有一些元数据表明当前的inode是目录而不是一个文件？**
>
> **Frans教授：有的，实际上是在inode中。inode中的type字段表明这是一个目录还是一个文件。如果你对一个类型是文件的inode进行查找，文件系统会返回错误。**
>

**很明现，这里的结构不是很有效。为了找到一个目录名，你需要线性扫描。**

**实际的文件系统会使用更复杂的数据结构来使得查找更快，当然这又是设计数据结构的问题，而不是设计操作系统的问题。你可以使用你喜欢的数据结构并提升性能。出于简单和更容易解释的目的，XV6使用了这里这种非常简单的数据结构。**

## **<font style="color:rgb(38, 38, 38);">14.5 File system工作示例</font>**
### xv6 调用 **makefs 创建**文件系统
**接下来我们看一下实际中，XV6的文件系统是如何工作的，这部分内容对于下一个lab是有帮助的。**

**首先我会启动XV6，这里有件事情我想指出。启动XV6的过程中，调用了makefs指令，来创建一个文件系统。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRjLOMOKliOOsweWquL%252F-MRnLn0A5b7nG1Wau6n7%252Fimage.png%3Falt%3Dmedia%26token%3Dc94d6979-d952-439d-8df7-7687b96b0cd8&width=768&dpr=4&quality=100&sign=9f8d9f6b&sv=1)

**所以makefs创建了一个全新的磁盘镜像，在这个磁盘镜像中包含了我们在指令中传入的一些文件。makefs为你创建了一个包含这些文件的新的文件系统。**

**XV6总是会打印文件系统的一些信息，所以从指令的下方可以看出有46个meta block，其中包括了：**

+ **boot block**
+ **super block**
+ **30个log block**
+ **13个inode block**
+ **1个bitmap block**

**之后是954个data block。所以这是一个袖珍级的文件系统，总共就包含了1000个block。在File system lab中，你们会去支持更大的文件系统。**

### File System 工作实例
**我还稍微修改了一下XV6，使得任何时候写入block都会打印出block的编号。我们从console的输出可以看出，在XV6启动过程中，会有一些对于文件系统的调用，并写入了block 33，45，32。**

**接下来我们运行一些命令，来看一下特定的命令对哪些block做了写操作，并理解为什么要对这些block写入数据。我们通过echo “hi” > x，来创建一个文件x，并写入字符“hi”。我会将输出拷贝出来，并做分隔以方便我们更好的理解。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRjLOMOKliOOsweWquL%252F-MRnQIqwv24XHAFU0MIp%252Fimage.png%3Falt%3Dmedia%26token%3Dfaaf555e-9035-42a1-99a1-59ca11f2dafa&width=768&dpr=4&quality=100&sign=369f80b7&sv=1)

**这里会有几个阶段**

1. **第一阶段是创建文件**
2. **第二阶段将“hi”写入文件**
3. **第三阶段将“\n”换行符写入到文件**

**如果你去看echo的代码实现，基本就是这3个阶段。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRjLOMOKliOOsweWquL%252F-MRnQboy67acBF_L3BnE%252Fimage.png%3Falt%3Dmedia%26token%3D5d4c8370-a555-4cae-9fac-33b1f41ef675&width=768&dpr=4&quality=100&sign=fc62f19e&sv=1)

**上面就是echo的代码，它先检查参数，并将参数写入到文件描述符1，在最后写入一个换行符。**

---

**让我们一个阶段一个阶段的看echo的执行过程，并理解对于文件系统发生了什么。相比看代码，这里直接看磁盘的分布图更方便：**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2Fgblobscdn.gitbook.com%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRhzbAZwhuzp63wWdRE%252F-MRielGcbrHOzPCrxHcO%252Fimage.png%3Falt%3Dmedia%26token%3Df685aafe-7c22-4965-9936-d811b090023d&width=768&dpr=4&quality=100&sign=196096f8&sv=1)

+ **现在我们看第一阶段创建文件的过程**
1. 两次对**block 33**（即inode）的写入：
    - 第一次：将inode从空闲状态标记为已使用（文件类型）。
    - 第二次：更新inode内容，包括设置链接计数为1等信息。
2. 对**block 46**的写入是为了在根目录中创建一个新条目，该条目包含新文件x的名字及其inode编号。
3. 写入**block 32**是因为根目录大小增加了16字节（新增加了文件x的信息）。
4. 最后再一次写入**block 33**是为了进一步更新文件x的inode信息。
+ **第二阶段是向文件写入“hi”。**
+ write 45：更新位图(bitmap)以标记数据块45已被使用。
+ write 595（两次）：文件系统选择了数据块595来存储文件x的数据，因写入了两个字符，所以操作重复了两次。
+ write 33：更新文件x的inode中的大小字段，反映文件现在包含两个字符。

> **学生提问：block 595看起来在磁盘中很靠后了，是因为前面的block已经被系统内核占用了吗？**
>
> **Frans教授：我们可以看前面makefs指令，makefs存了很多文件在磁盘镜像中，这些都发生在创建文件x之前，所以磁盘中很大一部分已经被这些文件填满了。**
>
> **学生提问：第二阶段最后的write 33是否会将block 595与文件x的inode关联起来？**
>
> **Frans教授：会的。这里的write 33会发生几件事情：首先inode的size字段会更新；第一个direct block number会更新。这两个信息都会通过write 33一次更新到磁盘上的inode中。**
>

**以上就是磁盘中文件系统的组织结构的核心，希望你们都能理解背后的原理。**

## **<font style="color:rgb(38, 38, 38);">14.6 XV6创建inode代码展示 </font>**
接下来我们通过查看XV6中的代码，更进一步的了解文件系统。

因为我们前面已经分配了inode，我们先来看一下这是如何发生的。sysfile.c中包含了所有与文件系统相关的函数，分配inode发生在sys_open函数中，这个函数会负责创建文件。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRnWMO2uGvqJaeeQWYJ%252F-MRoPgvXy5DGjE-avRxQ%252Fimage.png%3Falt%3Dmedia%26token%3Db75b0d93-f173-46ad-8a6e-bc40dc9fdfb1&width=768&dpr=4&quality=100&sign=6bca4afa&sv=1)

**在sys****_****open函数中，会调用create函数。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRnWMO2uGvqJaeeQWYJ%252F-MRoQI_qaK0TMbG-DWH9%252Fimage.png%3Falt%3Dmedia%26token%3D86c4902f-9e35-4bb1-86c0-a7a5b2368656&width=768&dpr=4&quality=100&sign=30ca3fe3&sv=1)

**create函数中首先会解析路径名并找到最后一个目录，之后会查看文件是否存在，**

**如果存在的话会返回错误。之后就会调用ialloc（inode allocate），这个函数会为文件x分配inode。ialloc函数位于fs.c文件中。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRnWMO2uGvqJaeeQWYJ%252F-MRoSXy8X0cLHmhDL2bU%252Fimage.png%3Falt%3Dmedia%26token%3D64e99ed8-137d-4ed5-862f-9b3cea344f65&width=768&dpr=4&quality=100&sign=e29296ab&sv=1)	

**以上就是ialloc函数，与XV6中的大部分函数一样，它很简单，但是又不是很高效。**

---

**它会遍历所有可能的inode编号，找到inode所在的block，再看位于block中的inode数据的type字段。如果这是一个空闲的inode，那么将其type字段设置为文件，这会将inode标记为已被分配。函数中的log_write就是我们之前看到在console中有关写block的输出。**

---

**这里的log_write是我们看到的整个输出的第一个。**

**以上就是第一次写磁盘涉及到的函数调用。**

**这里有个有趣的问题，如果有多个进程同时调用create函数会发生什么？**

**对于一个多核的计算机，进程可能并行运行，两个进程可能同时会调用到ialloc函数，然后进而调用bread（block read）函数。所以必须要有一些机制确保这两个进程不会互相影响。**

**让我们看一下位于bio.c的buffer cache代码。首先看一下bread函数**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRnWMO2uGvqJaeeQWYJ%252F-MRodWqt9DRWE7pp8rsE%252Fimage.png%3Falt%3Dmedia%26token%3Da94ba7fc-8c80-4d49-b08e-5844b4ae4d4a&width=768&dpr=4&quality=100&sign=46acc94a&sv=1)

**bread函数首先会调用bget函数，bget会为我们从buffer cache中找到block的缓存。**

**让我们看一下bget函数**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRnWMO2uGvqJaeeQWYJ%252F-MRohZd0-JtnZQxBAyFW%252Fimage.png%3Falt%3Dmedia%26token%3D61e4c7d6-bc44-470d-aa44-9822d039eadc&width=768&dpr=4&quality=100&sign=f7ae486d&sv=1)

**这里的代码还有点复杂。我猜你们之前已经看过这里的代码，那么这里的代码在干嘛？**

> **学生回答：这里遍历了linked-list，来看看现有的cache是否符合要找的block。**
>

1. **检查block 33的cache是否存在。**
2. **如果存在，增加block对象的引用计数(refcnt)，然后释放bcache锁。**
3. **接着尝试获取block cache的锁。**
4. **如果有多个进程同时请求，其中一个会获得bcache锁并检查buffer cache，期间其他进程不能修改buffer cache。**
5. **若找到对应的block number在cache中，则再次增加其引用计数，并释放bcache锁。**
6. **此时另一个等待中的进程可获取bcache锁并执行相同操作。**

**两个进程都会尝试通过acquiresleep()函数锁定block 33的cache。其中一个进程成功锁定后继续执行（如在ialloc函数中查找空闲inode），而另一个则需等待锁被释放。**

**acquiresleep()是一种sleep lock机制，用于确保同一时间只有一个进程可以操作特定资源。**

> **学生提问：当一个block cache的refcnt不为0时，可以更新block cache吗？因为释放锁之后，可能会修改block cache。**
>
> **Frans教授：这里我想说几点；首先XV6中对bcache做任何修改的话，都必须持有bcache的锁；其次对block 33的cache做任何修改你需要持有block 33的sleep lock。所以在任何时候，release(&bcache.lock)之后，b->refcnt都大于0。block的cache只会在refcnt为0的时候才会被驱逐，任何时候refcnt大于0都不会驱逐block cache。所以当b->refcnt大于0的时候，block cache本身不会被buffer cache修改。这里的第二个锁，也就是block cache的sleep lock，是用来保护block cache的内容的。它确保了任何时候只有一个进程可以读写block cache。**
>

**如果buffer cache中有两份block 33的cache将会出现问题。假设一个进程要更新inode19，另一个进程要更新inode20。如果它们都在处理block 33的cache，并且cache有两份，那么第一个进程可能持有一份cache并先将inode19写回到磁盘中，而另一个进程持有另一份cache会将inode20写回到磁盘中，并将inode19的更新覆盖掉。所以一个block只能在buffer cache中出现一次。你们在完成File system lab时，必须要维持buffer cache的这个属性。**

> **学生提问：如果多个进程都在使用同一个block的cache，然后有一个进程在修改block，并通过强制向磁盘写数据修改了block的cache，那么其他进程会看到什么结果？**
>
> **Frans教授：如果第一个进程结束了对block 33的读写操作，它会对block的cache调用brelse（block cache release）函数。**
>

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRop0fj_cSG2EATuguT%252F-MRr3Wi4t2ubLCYP9UDv%252Fimage.png%3Falt%3Dmedia%26token%3D7f9cfe72-9d37-4ac9-be3f-b25ed342a1ad&width=768&dpr=4&quality=100&sign=378dff28&sv=1)

> **这个函数会对refcnt减1，并释放sleep lock。这意味着，如果有任何一个其他进程正在等待使用这个block cache，现在它就能获得这个block cache的sleep lock，并发现刚刚做的改动。**
>
> **假设两个进程都需要分配一个新的inode，且新的inode都位于block 33。如果第一个进程分配到了inode18并完成了更新，那么它对于inode18的更新是可见的。另一个进程就只能分配到inode19，因为inode18已经被标记为已使用，任何之后的进程都可以看到第一个进程对它的更新。**
>
> **这正是我们想看到的结果，如果一个进程创建了一个inode或者创建了一个文件，之后的进程执行读就应该看到那个文件。**
>

## 14.7 Sleep Lock
**block cache**使用的是**sleep lock**。**sleep lock**区别于一个常规的**spinlock**。我们先看来一下**sleep lock**。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRr3gfIDCTMvY7N6U4V%252F-MRteSLOezqXvcfZPyjL%252Fimage.png%3Falt%3Dmedia%26token%3D356d75c6-da32-4a4b-ac9b-b3361fdbb6ee&width=768&dpr=4&quality=100&sign=b52602a&sv=1)

首先是**acquiresleep**函数，它用来获取**sleep lock**。函数里首先获取了一个普通的**spinlock**，这是与**sleep lock**关联在一起的一个锁。之后，如果**sleep lock**被持有，那么就进入**sleep**状态，并将自己从当前**CPU**调度开。

既然**sleep lock**是基于**spinlock**实现的，为什么对于**block cache**，我们使用的是**sleep lock**而不是**spinlock**？

> 学生回答：因为磁盘的操作需要很长的时间。
>

是的，这里其实有多种原因。 由于 **spinlock** 要求加锁时关闭中断，这会导致在进行 **block cache** 操作时，如果只有一个 CPU 核心，就无法接收磁盘数据。为了解决这个问题，使用 **sleep lock**。与 spinlock 不同，sleep lock 允许在持锁时不关闭中断，支持长时间持锁，同时可以在等待时通过 **sleep** 释放 CPU，避免空转，适合磁盘操作等长时间任务。  

接下来让我们看一下brelease函数。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRr3gfIDCTMvY7N6U4V%252F-MRtiEulVAO6X0FgkFvZ%252Fimage.png%3Falt%3Dmedia%26token%3D51bebdf4-41a1-4630-88e5-36b445b90f69&width=768&dpr=4&quality=100&sign=72caf081&sv=1)  
**brelease函数首先释放sleep lock，然后获取bcache锁，接着减少block cache的引用计数。**

**如果引用计数降至0，该block cache会被移动到linked-list头部，标记为最近使用过。**

**这样基于LRU算法优化了缓存管理：当需要腾出空间给新block时，系统可以轻易地移除最久未使用的block。有效利用了时间局部性原理——即近期被访问过的数据在未来短时间内可能再次被访问.**

---

**以上就是对于block cache代码的介绍。这里有几件事情需要注意：**

+ 首先在内存中，对于一个block只能有一份缓存。这是block cache必须维护的特性。
+ 其次，这里使用了与之前的spinlock略微不同的sleep lock。与spinlock不同的是，可以在I/O操作的过程中持有sleep lock。
+ 第三，它采用了LRU作为cache替换策略。
+ 第四，它有两层锁。第一层锁用来保护buffer cache的内部数据；第二层锁也就是sleep lock用来保护单个block的cache。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRr3gfIDCTMvY7N6U4V%252F-MRtnma6CWSAlQZxpPlc%252Fimage.png%3Falt%3Dmedia%26token%3D1023b2b0-ac4e-484d-a0eb-4e6fe9dd9dfd&width=768&dpr=4&quality=100&sign=60b79800&sv=1)

让我们来总结一下今天的内容，并把剩下的部分留到下节课讨论。

1. 文件系统是一种存储在磁盘上的数据结构。今天我们主要介绍了XV6中相对简单的文件系统实现，但你可以设计更复杂的数据结构。
2. 我们还探讨了block cache的实现，这对提高性能非常重要。由于直接读写磁盘耗时较长（可能达数百毫秒），block cache可以帮助我们避免重复读取最近30天内已经访问过的数据块。

> **学生提问：我有个关于brelease函数的问题，看起来它先释放了block cache的锁，然后再对引用计数refcnt减一，为什么可以这样呢？**
>
> **Frans教授：这是个好问题。如果我们释放了sleep lock，这时另一个进程正在等待锁，那么refcnt必然大于1，而b->refcnt --只是表明当前执行brelease的进程不再关心block cache。如果还有其他进程正在等待锁，那么refcnt必然不等于0，我们也必然不会执行if(b->refcnt == 0)中的代码。**
>


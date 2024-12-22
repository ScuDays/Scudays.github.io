---
title: Lec15：Crash recovery (Frans)
date: 2024-12-22 00:39:59
modify: 2024-12-22 16:41:13
author: days
category: 6S081
published: 2024-12-22
---
# Lec15：Crash recovery (Frans)
## **<font style="color:rgb(38, 38, 38);">15.1 File system crash 概述 </font>**
**今天的课程是有关文件系统中的Crash safety。**

**这里的Crash safety并不是一个通用的解决方案，而是只关注一个特定的问题的解决方案，也就是crash或者电力故障可能会导致在磁盘上的文件系统处于不一致或者不正确状态的问题。**

**当我说不正确的状态时，是指例如一个data block属于两个文件，或者一个inode被分配给了两个不同的文件。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRyxv0fEw2XNZOuZsKa%252F-MS0L2Hii92LMifPBN-T%252Fimage.png%3Falt%3Dmedia%26token%3D34051745-096d-48fa-bac8-7cd56782de92&width=768&dpr=4&quality=100&sign=db9c65c1&sv=1)

+ **举一个场景来说**

**当你运行make命令时，它会频繁地与文件系统交互并读写文件。如果在执行过程中突然断电（比如笔记本电池耗尽或停电），电力恢复后，你重启电脑并使用ls命令查看文件，应该希望文件系统仍然处于良好且可用的状态。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MRyxv0fEw2XNZOuZsKa%252F-MS0L8NVAQLmpP9GGdlf%252Fimage.png%3Falt%3Dmedia%26token%3D8e18b8f1-b1a6-4e3e-996f-0987f0cea205&width=768&dpr=4&quality=100&sign=bed9b9e6&sv=1)

**我们关注的故障包括文件系统操作过程中的电力故障和内核panic。这些故障可能导致文件系统处于不一致状态，从而影响其正常使用。**

**尽管文件系统存储在持久化设备上，但多步骤操作过程中若发生故障，会导致数据不一致问题。**

今天我们将重点讨论这种不一致性问题及其解决方案——logging。

Logging最初源于数据库技术，现已被许多文件系统采用。我们将通过XV6的简单实现来了解logging的基本概念及潜在问题，虽然XV6中实现的logging性能不佳，但它很好地展示了关键思想。为了进一步探讨如何构建高性能的logging系统，下节课我们将学习Linux的ext3文件系统。

---

**接下来让我们看一下这节课关注的场景。类似于创建文件，写文件这样的文件系统操作，都包含了多个步骤的写磁盘操作。我们上节课看过了如何创建一个文件，这里多个步骤的顺序是（注，实际步骤会更多，详见14.5）：**

+ **分配inode，或者在磁盘上将inode标记为已分配**
+ **之后更新包含了新文件的目录的data block**

**如果在这两个步骤之间，操作系统crash了。这时可能会使得文件系统的属性被破坏。这里的属性是指，每一个磁盘block要么是空闲的，要么是只分配给了一个文件。即使故障出现在磁盘操作的过程中，我们期望这个属性仍然能够保持。如果这个属性被破坏了，那么重启系统之后程序可能会运行出错，比如：**

+ **操作系统可能又立刻crash了，因为文件系统中的一些数据结构现在可能处于一种文件系统无法处理的状态。**
+ **或者，更可能的是操作系统没有crash，但是数据丢失了或者读写了错误的数据。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MS3B7dexA8SuHiCwQTJ%252F-MS5_wrIkLRAfex9F-IZ%252Fimage.png%3Falt%3Dmedia%26token%3D6ba85319-66a7-4542-826c-62c979a739cd&width=768&dpr=4&quality=100&sign=e5547991&sv=1)

我们将会看一些例子来更好的理解出错的场景，但是基本上来说这就是我们需要担心的一些风险。我不知道你们有没有人在日常使用计算机时经历过这些问题，比如说在电力故障之后，你重启电脑或者手机，然后电脑手机就不能用了，这里的一个原因就是文件系统并没有恢复过来。

## **<font style="color:rgb(38, 38, 38);">15.2 File system crash 示例</font>**
### xv6 文件系统分布
为了更清晰的理解这里的风险，让我们看一些基于XV6的例子，并看一下哪里可能出错。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MS5avG44oTj9OPuULJh%252F-MSAXQOgrMd0_xwG-Uay%252Fimage.png%3Falt%3Dmedia%26token%3D160db352-7dd5-4f4b-9827-a50008e5758b&width=768&dpr=4&quality=100&sign=aa9181a2&sv=1)

+ **XV6有一个非常简单的文件系统和磁盘数据的排布方式。**
1. **在super block之后就是log block，我们今天主要介绍的就是log block。**
2. **log block之后是inode block，每个block可能包含了多个inode。**
3. **然后是bitmap block，它记录了哪个data block是空闲的。**
4. **最后是data block，这里包含了文件系统的实际数据。**

---

### 潜在问题分析
在上节课中，我们看了一下在创建文件时，操作系统与磁盘**block**的交互过程（注，详见14.5）：

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MS5avG44oTj9OPuULJh%252F-MSAYdy7tK51ltglbIKH%252Fimage.png%3Falt%3Dmedia%26token%3Df3478cf9-3024-4eb0-9062-979a627398dc&width=768&dpr=4&quality=100&sign=d4ca4c48&sv=1)

**从上面可以看出，创建一个文件涉及到了多个操作：**

+ **首先是分配inode，因为首先写的是block 33**
+ **之后inode被初始化，然后又写了一次block 33**
+ **之后是写block 46，是将文件x的inode编号写入到x所在目录的inode的data block中**
+ **之后是更新root inode，因为文件x创建在根目录，所以需要更新根目录的inode的size字段，以包含这里新创建的文件x**
+ **最后再次更新了文件x的inode**

**下面我们假设几种出错的情况：**

现在我们想知道，哪里可能出错。假设我们在下面这个位置出现了电力故障或者内核崩溃。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MS5avG44oTj9OPuULJh%252F-MSA_aEiYxlhdm9pmIAB%252Fimage.png%3Falt%3Dmedia%26token%3De5ab4709-abce-4ad2-b3ba-a675389b4239&width=768&dpr=4&quality=100&sign=36f63356&sv=1)

### **Question：1**
**电力故障后，RAM中的所有数据（包括进程、文件描述符和缓存）都会丢失，因为这些数据不是持久化的。唯一能保留下来的是存储在磁盘上的数据，因为它具有持久性。如果在这个过程中发生电力故障且没有额外的日志记录或保护机制，后果可能很严重。**

1. **例如，在这里，我们标记一个inode为已使用（通过写block 33）之后但还未将其添加到任何目录中**
2. **此时：发生电力故障，会导致该inode丢失——它被标记为已分配但实际上并未关联到任何文件，因此无法删除或恢复。**

**为了防止这种情况（inode 被标记为已使用，但未关联到任何文件），可以调整写操作的顺序：**

1. **先更新目录内容（写block 46）**
2. **然后更新目录大小（写block 32）**
3. **最后才将inode标记为已使用（写block 33）。**

**这样即使中途断电，也能确保要么整个操作成功完成，要么保持状态不变。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MS5avG44oTj9OPuULJh%252F-MSAcwiOSz76RZzJngBD%252Fimage.png%3Falt%3Dmedia%26token%3D42204cb4-8d39-4ebe-9e8a-7f6dc39d03e1&width=768&dpr=4&quality=100&sign=555dd36e&sv=1)

### Question：2
**这里的效果是一样的，只是顺序略有不同。并且这样我们应该可以避免丢失inode的问题。**

**那么问题来了，这里可以工作吗？如果在下面的位置发生了电力故障会怎样？**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MS5avG44oTj9OPuULJh%252F-MSAdTgnkpJfIFlYw5Iz%252Fimage.png%3Falt%3Dmedia%26token%3D77ae260f-1768-479c-8270-fd0481c1e4fc&width=768&dpr=4&quality=100&sign=2f1ecfe8&sv=1)

+ **在这个位置，目录被更新了，但是还没有在磁盘上分配inode，如果这个时候电力故障，然后我们读取根目录下的文件x，会发生什么？**

**是的，我们会读取一个未被分配的inode，因为inode在crash之前还未被标记成被分配。更**

**糟糕的是，如果inode之后被分配给一个不同的文件，这样会导致有两个应该完全不同的文件共享了同一个inode。如果这两个文件分别属于用户1和用户2，那么用户1就可以读到用户2的文件了。所以上面的解决方案也不好。**

---

**所以调整写磁盘的顺序并不能彻底解决我们的问题，我们只是从一个问题换到了一个新的问题。**

**（后面还有一个例子，不记录了）**

**所以这里的问题并不在于操作的顺序，而在于我们这里有多个写磁盘的操作，这些操作必须作为一个原子操作出现在磁盘上。**





## 15.3 File system logging 日志
### logging 优点
在本节课中，我们将探讨一种针对文件系统崩溃后问题的有效解决方案——日志记录（logging）。

1. **atomic fscalls 原子性保证**：日志记录能够确保文件系统的系统调用具有原子性。这意味着，当执行如创建或写入等系统调用时，其效果将是全有或全无的；即要么所有更改完整地反映到存储介质上，要么完全不发生任何变更。这种方式有效避免了部分写操作导致的数据不一致问题。
2. **fast recovery 快速恢复能力**：采用日志记录机制还赋予了系统快速恢复的能力。一旦发生故障并重启后，无需进行复杂且耗时的修复过程即可迅速恢复正常运行状态。相比之下，传统的方法可能需要遍历整个文件系统结构，包括读取所有块、inode以及位图块等信息，以验证数据完整性并对潜在错误进行修正。而通过利用日志记录技术，则可显著减少此类开销，实现高效快捷的恢复流程。
3. **high performance 理论上的高效率**：从理论上讲，基于日志记录的设计方案具备高度优化的可能性。尽管在XV6操作系统中的实际应用案例显示其实现尚存改进空间，但该方法本身为构建既可靠又高效的文件管理系统提供了坚实基础。

**我们会在下节课看一下，如何构建一个logging系统，并同时具有原子性的系统调用，快速恢复和高性能，而今天，我们只会关注前两点。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MSAkAZr2DIOUCEdzJf7%252F-MSFsrBdH4y1Jp7HLU8M%252Fimage.png%3Falt%3Dmedia%26token%3D554d51a6-90d1-401f-a780-8838826804ae&width=768&dpr=4&quality=100&sign=863f0fdf&sv=1)

### logging 基本思想
1. **磁盘分区**：磁盘被分成两个主要部分，一个是用于存储日志（log）的区域，另一个是实际的文件系统。日志部分通常比文件系统部分小得多。
2. **日志的作用**：日志的核心作用是记录即将对文件系统进行的所有修改。这种方法称为“**先写日志**”（write-ahead logging），意味着在任何数据被写入文件系统之前，相关的修改信息首先被记录在日志中。这样做的目的是为了在系统发生故障时可以使用日志来恢复文件系统到最后一次一致的状态。
3. **操作过程**：**分为四步**
    1. **log write：当文件系统需要更新时（如修改一个文件或目录的结构），更新操作不会直接作用于文件系统中的数据块，而是先在日志中记录下来**
    2. **commit op:之后在某个时间，当文件系统的操作结束了，我们会commit文件系统的操作。这意味着我们需要在log的某个位置记录属于同一个文件系统的操作的个数,例如5。**
    3. **install log:当我们在log中存储了所有写block的内容时，如果我们要真正执行这些操作，只需要将block从log分区移到文件系统分区。我们知道第一个操作该写入到block 45，我们会直接将数据从log写到block45，第二个操作该写入到block 33，我们会将它写入到block 33，依次类推。**
    4. **clean log:整套操作一旦完成了，就可以清除系统中的log。清除log实际上就是将属于同一个文件系统的操作的个数设置为0。**

**所以基本上，任何一次写操作都是先写入到log，我们并不是直接写入到block所在的位置，而总是先将写操作写入到log中。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MSAkAZr2DIOUCEdzJf7%252F-MSFuU1ktT24qMEUtlP0%252Fimage.png%3Falt%3Dmedia%26token%3D1eddd9f1-b9cd-4379-9ac9-aa4712a9fdc5&width=768&dpr=4&quality=100&sign=643232c9&sv=1)

+ **解释：****为什么这样的方式是有效的呢？**

**假设我们crash并重启了。在重启的时候，文件系统会查看log的commit记录值；如果是0的话，那么什么也不做。如果大于0的话，我们就知道log中存储的block需要被写入到文件系统中，很明显我们在crash的时候并不一定完成了install log，我们可能是在commit之后，clean log之前crash的。所以这个时候我们需要做的就是reinstall（注，也就是将log中的block再次写入到文件系统），再clean log。**

---

这里的方法之所以能起作用，是因为可以确保当发生crash（并重启之后），我们要么将写操作所有相关的block都在文件系统中更新了，要么没有更新任何一个block，我们永远也不会只写了一部分block。为什么可以确保呢？我们考虑crash的几种可能情况。

+ 在第1步和第2步之间crash会发生什么？在重启的时候什么也不会做，就像系统调用从没有发生过一样，也像crash是在文件系统调用之前发生的一样。这完全可以，并且也是可接受的。
+ 在第2步和第3步之间crash会发生什么？在这个时间点，所有的log block都落盘了，因为有commit记录，所以完整的文件系统操作必然已经完成了。我们可以将log block写入到文件系统中相应的位置，这样也不会破坏文件系统。所以这种情况就像系统调用正好在crash之前就完成了。
+ 在**install**（第3步）过程中和第4步之前这段时间**crash**会发生什么？在下次重启的时候，我们会**redo log**，我们或许会再次将**log block**中的数据再次拷贝到文件系统。这样也是没问题的，因为log中的数据是固定的，我们就算重复写了文件系统，每次写入的数据也是不变的。重复写入并没有任何坏处，因为我们写入的数据可能本来就在文件系统中，所以多次**install log**完全没问题。当然在这个时间点，我们不能执行任何文件系统的系统调用。我们应该在重启文件系统之前，在重启或者恢复的过程中完成这里的恢复操作。换句话说，**install log**是幂等操作（注，idempotence，表示执行多次和执行一次效果一样），你可以执行任意多次，最后的效果都是一样的。



> 学生提问：因为这里的接口只有read/write，但是如果我们做append操作，就不再安全了，对吧？
>
> Frans教授：某种程度来说，append是文件系统层面的操作，在这个层面，我们可以使用上面介绍的logging机制确保其原子性（注，append也可以拆解成底层的read/write）。
>
> 学生提问：当正在commit log的时候crash了会发生什么？比如说你想执行多个写操作，但是只commit了一半。
>
> Frans教授：在上面的第2步，执行commit操作时，你只会在记录了所有的write操作之后，才会执行commit操作。所以在执行commit时，所有的write操作必然都在log中。而commit操作本身也有个有趣的问题，它究竟会发生什么？如我在前面指出的，commit操作本身只会写一个block。文件系统通常可以这么假设，单个block或者单个sector的write是原子操作（注，有关block和sector的区别详见14.3）。这里的意思是，如果你执行写操作，要么整个sector都会被写入，要么sector完全不会被修改。所以sector本身永远也不会被部分写入，并且commit的目标sector总是包含了有效的数据。而commit操作本身只是写log的header，如果它成功了只是在commit header中写入log的长度，例如5，这样我们就知道log的长度为5。这时crash并重启，我们就知道需要重新install 5个block的log。如果commit header没能成功写入磁盘，那这里的数值会是0。我们会认为这一次事务并没有发生过。这里本质上是write ahead rule，它表示logging系统在所有的写操作都记录在log中之前，不能install log。
>

### logging 实现
Logging的实现方式有很多，我这里展示的指示一种非常简单的方案，这个方案中clean log和install log都被推迟了。接下来我会运行这种非常简单的实现方式，

所有的这些协议都遵循了write ahead rule，也就是说在写入commit记录之前，你需要确保所有的写操作都在log中。在这个范围内，还有大量设计上的灵活性可以用来设计特定的logging协议。

在XV6中，我们会看到数据有两种状态，是在磁盘上还是在内存中。内存中的数据会在crash或者电力故障之后丢失。

---

XV6的**log**结构如往常一样也是极其的简单。

在最开头有一个**header block**，也就是我们的**commit record**，里面包含了：

+ **<font style="background-color:#FBDE28;">数字n代表有效的log block的数量</font>**
+ **<font style="background-color:#FBDE28;">每个log block的实际对应的block编号</font>**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MS_F6nYy0utF738c_Y7%252F-MS_JEySs_8RPJRNtr3P%252Fimage.png%3Falt%3Dmedia%26token%3Dd6540674-854b-4870-994f-26273d09ce98&width=768&dpr=4&quality=100&sign=edfbfd70&sv=1)

之后就是**log**的数据，也就是每个**block**的数据，依次为**bn0**对应的**block**的数据，**bn1**对应的**block**的数据以此类推。这就是**log**中的内容，并且**log**也不包含其他内容。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MS_F6nYy0utF738c_Y7%252F-MS_Jd_2T4uf7GBC3ayB%252Fimage.png%3Falt%3Dmedia%26token%3D376169b6-3c62-40c2-989d-63925944752c&width=768&dpr=4&quality=100&sign=a9eff2cc&sv=1)

当文件系统在运行时，在内存中也有**header block**的一份拷贝，拷贝中也包含了**n**和**block**编号的数组。这里的**block**编号数组就是**log**数据对应的实际**block**编号，并且相应的**block**也会缓存在**block cache**中，这个在Lec14有介绍过。与前一节课对应，**log**中第一个**block**编号是45，那么在**block cache**的某个位置，也会有**block 45**的cache。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MS_F6nYy0utF738c_Y7%252F-MS_LgeEJdY8hOFkuQBW%252Fimage.png%3Falt%3Dmedia%26token%3D14090c19-6cca-4918-9fdc-b03add2ac1f7&width=768&dpr=4&quality=100&sign=3b9782c9&sv=1)

## 15.4 log_write函数
接下来让我们看一些代码来帮助我们理解这里是怎么工作的。

前面我提过事务（transaction），也就是我们不应该在所有的写操作完成之前写入commit record。这意味着文件系统操作必须表明事务的开始和结束。

**在XV6中，以创建文件的sys_open为例（在sysfile.c文件中）每个文件系统操作，都有begin_op和end_op分别表示事物的开始和结束。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/8dbba1deb9194076df6c568273e1f35e.png)  
begin_op 标志着事务的开始，而 end_op 切标志着事务的结束。

在这两者之间的所有写入操作都是原子性的，即这些操作要么全部成功执行，要么都不执行。

XV6 文件系统的调用遵循这一模式：先调用 begin_op，然后执行具体的系统调用代码，最后以 end_op 结束，在此过程中完成提交操作。

在 begin_op 和 end_op 之间，虽然数据结构可能在内存或磁盘上被更新，但直到 end_op 执行时才会真正地将更改写入日志并记录提交信息。

---

这里有趣的是，当文件系统调用执行写磁盘时会发生什么？

让我们看一下fs.c中的ialloc，

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/28f31067d12d39934ac1f1140abb7adc.png)

在这个函数中，并没有直接调用bwrite，这里实际调用的是log_write函数。log_write是由文件系统的logging实现的方法。任何一个文件系统调用的begin_op和end_op之间的写操作总是会走到log_write。log_write函数位于log.c文件，

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/a1f7039c5e430d374815bcdbe7c4d05e.png)

**log_write **的过程相对简单直观。当我们向 **block cache **中的某个 **block**（如 block 45）写入数据后，下一步是在内存中标记该 **block **需要在未来的 **commit** 操作中被写入磁盘的日志。  
具体步骤如下：

1. 获取 **log header** 的锁。
2. 检查 **block 45** 是否已经被标记为需要写入日志。如果是，则利用“log absorption”机制忽略重复操作。
3. 如果 **block 45** 还未被标记，则增加计数器 n，并将 block 45 添加到待写入列表末尾。
4. 使用 bpin 函数确保 block 45 被固定在 block cache 中，以备后续使用。  
简而言之，所有修改 block 或 block cache 的文件系统调用都会尝试更新内存中的 log header，除非目标 block 已经存在于要写入磁盘的列表里。

## 15.5 end_op函数
接下来我们看看位于log.c中的end_op函数中会发生什么？

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MS_F6nYy0utF738c_Y7%252F-MS_TZfXthFK7G6TBjwQ%252Fimage.png%3Falt%3Dmedia%26token%3Dfe85217e-cd9f-48d3-909b-46f08611a800&width=768&dpr=4&quality=100&sign=36efebfa&sv=1)

可以看到，即使是这么简单的一个文件系统也有一些微秒的复杂之处，代码的最开始就是一些复杂情况的处理（注，15.8有这部分的解释）。

我直接跳到正常且简单情况的代码。在简单情况下，没有其他的文件系统操作正在处理中。这部分代码非常简单直观，首先调用了commit函数。让我们看一下commit函数的实现，

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MS_F6nYy0utF738c_Y7%252F-MS_UUuwIJG1hOiTEQAe%252Fimage.png%3Falt%3Dmedia%26token%3Df9a956e1-3d75-4726-81f4-943d887126b8&width=768&dpr=4&quality=100&sign=92891898&sv=1)

commit中有两个操作：

+ 首先是**write_log**。这基本上就是将所有存在于内存中的log header中的block编号对应的block，从block cache写入到磁盘上的log区域中（注，也就是将变化先从内存拷贝到log中）。
+ **write_head**会将内存中的log header写入到磁盘中。

我们看一下**write_log**的实现。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MS_VGWOKDK13rJZN0tR%252F-MSeYhlUmgo4ydh2QX6j%252Fimage.png%3Falt%3Dmedia%26token%3Df84897d4-faba-4e9b-bc9f-84bccc08a4c4&width=768&dpr=4&quality=100&sign=5eeb8f28&sv=1)

1. **遍历日志记录并写入到日志中**：  
函数会依次读取日志（log）中记录的每一个 block 数据。每个 block 是存储系统中需要被更新的数据的最小单元。
2. **将 cache 中的 block 写入到日志 block 中**：  
程序会先将内存中缓存的 block 数据复制到日志中对应的位置。这个步骤的目的是在实际写入磁盘之前，确保这些需要更新的数据能够被记录在日志中。
3. **将日志 block 写回到磁盘**：  
在确保日志中记录了所有要写入的 block 后，日志 block 会被写入到磁盘的持久化存储中。这一步是为了防止系统崩溃时丢失数据。
4. **此时还没有 commit**：  
目前的状态是，block 已经被写入到了日志，但事务还没有 "提交"（commit）。这意味着事务的状态还未完全确定，日志的作用是为后续的操作提供一个安全的恢复点。
5. **如果在此阶段崩溃**：  
如果系统在写入日志的阶段发生崩溃（特别是在 write_head 之前），由于事务尚未提交，系统在恢复时会忽略这些未提交的日志数据。因此，从外部观察，表现为这个事务从未发生过。

接下来看一下write_head函数，我之前将write_head称为**commit point**。

也就是这个执行完了函数之后，事务被提交了。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MS_VGWOKDK13rJZN0tR%252F-MSeal3IXJLlbxl0wF4Z%252Fimage.png%3Falt%3Dmedia%26token%3Df4567131-f5f5-4528-ad28-f74eefa05cb7&width=768&dpr=4&quality=100&sign=b30df602&sv=1)

### 函数的工作机制：
1. **读取 log 的 header block**：  
函数开始时，首先读取日志的头部 block（header block）。这个 header block 通常用于存储日志的元信息，比如日志中包含的 block 数量（n）和每个 block 的编号。
2. **将 n 和 block 编号列表写入 header block**：  
函数会把 n（表示需要写入日志的 block 数量）以及这些 block 的编号存储到 header block 的列表中。这是为了在日志中记录需要更新的文件系统 block 信息。
3. **将 header block 写回磁盘**：  
使用 bwrite 将更新后的 header block 写回磁盘，这一步是非常关键的，因为它标志着 commit point。
+ **bwrite 是否是实际的 commit point？**

是的，bwrite 是实际的 commit point，原因如下：

+ **在 bwrite 之前发生 crash**：  
如果在 bwrite 之前系统崩溃，虽然日志的 header block 已经部分写入，但这些数据尚未完全写回磁盘。因此，日志不完整，重启恢复时，恢复程序会忽略这些未完成的日志记录，文件系统的状态仍然是一致的。这就像事务从未发生过。
+ **在 bwrite 之后发生 crash**：  
如果在 bwrite 之后系统崩溃，此时日志的 header block 已经完全写入磁盘。恢复程序在重启后会读取日志的 header，发现其中记录了未完成的日志 block 信息（比如 header 中的 `n` 表明有 5 个日志 block 需要处理）。恢复程序会：
    1. 根据 header 中的 block 列表，逐个将日志 block 的内容拷贝到文件系统的实际 block 中。
    2. 确保所有的更新都被正确应用，完成事务。

**让我们看一下install_trans函数**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MSeczlhbFKSwLmq0egq%252F-MSjgrFOOOtGDmrKJ0xQ%252Fimage.png%3Falt%3Dmedia%26token%3De9f0238c-6f4f-4d98-8a39-a0778ded6d9e&width=768&dpr=4&quality=100&sign=f13f7fe7&sv=1)

install_trans 是恢复过程中执行的核心函数，它的作用是：

1. 读取日志的 header，判断日志中记录了哪些 block 尚未应用。
2. 将日志 block 的内容拷贝到文件系统的目标位置，完成日志的安装（install）。
3. 确保文件系统的状态和日志中记录的一致。

**当然，可能在这里代码的某个位置会出现问题，但对最后文件系统没有影响，因为在恢复的时候，我们会从最开始重新执行过。**

在commit函数中，install结束之后，会将log header中的n设置为0，再将log header写回到磁盘中。将n设置为0的效果就是清除log。

## 15.6 File system recovering 
接下来我们看一下发生在XV6的启动过程中的文件系统的恢复流程。

**当系统crash并重启了，在XV6启动过程中做的一件事情就是调用initlog函数。**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MSeczlhbFKSwLmq0egq%252F-MSjlpdC7kU7Jkb_m2t8%252Fimage.png%3Falt%3Dmedia%26token%3D816178b1-18fa-4f4d-a180-d83093a91e38&width=768&dpr=4&quality=100&sign=a6a65dc5&sv=1)

**initlog**基本上就是调用**recover_from_log**函数。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MSeczlhbFKSwLmq0egq%252F-MSjm0zKwyo8J3kcTgE8%252Fimage.png%3Falt%3Dmedia%26token%3Dc07bbbe1-849f-4d35-a0f7-abd16ef92134&width=768&dpr=4&quality=100&sign=1f68c9da&sv=1)

**recover_from_log()流程**

1. **调用 read_head 读取 header**：
    1. 从磁盘中读取日志的 header block，提取日志中的元信息，比如待恢复的 block 数量（n）和每个 block 的编号。
2. **调用 install_trans 应用日志**：
    1. 根据 header 中的 n 值，逐个将日志 block 拷贝到文件系统的目标位置（实际的 block 中）。
    2. 这一步是将事务中记录的操作应用到文件系统中。
3. **清除日志**：
    1. 和 commit 函数最后的逻辑一致，将日志的 header 中的 n 设置为 0，并写回磁盘。
    2. 清空日志，标志恢复完成，文件系统已是最新状态。

这就是恢复的全部流程。如果我们在install_trans函数中又crash了，也不会有问题，因为之后再重启时，XV6会再次调用initlog函数，再调用recover_from_log来重新install log。如果我们在commit之前crash了多次，在最终成功commit时，log可能会install多次。

## 15.7 Log写磁盘流程 
我已经在bwrite函数中加了一个print语句。bwrite函数是block cache中实际写磁盘的函数，所以我们将会看到实际写磁盘的记录。

在上节课（Lec 14）我将print语句放在了log_write中，log_write只能代表文件系统操作的记录，并不能代表实际写磁盘的记录。我们这里会像上节课一样执行echo "hi" > x，并看一下实际的写磁盘过程。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MSmzTZnlPGPIqpj2mML%252F-MSpExI_mBk7ES2XQvj8%252Fimage.png%3Falt%3Dmedia%26token%3Ddc4a94b4-e130-4938-9a23-4ef8df8bdc33&width=768&dpr=4&quality=100&sign=b48c5575&sv=1)

很明显这里的记录要比只在log_write中记录要长的多。之前的log_write只有11条记录（注，详见14.5）但是可以看到实际上背后有很多个磁盘写操作，让我们来分别看一下这里的写磁盘操作：

+ 首先是前3行的bwrite 3，4，5。因为block 3是第一个log data block，所以前3行是在log中记录了3个写操作。这3个写操作都保存在log中，并且会写入到磁盘中的log部分。
+ 第4行的bwrite 2。因为block 2是log的起始位置，也就是log header，所以这条是commit记录。
+ 第5，6，7行的bwrite 33，46，32。这里实际就是将前3行的log data写入到实际的文件系统的block位置，这里实际是install log。
+ 第8行的bwrite 2，是清除log（注，也就是将log header中的n设置为0）。到此为止，完成了实际上的写block 33，46，32这一系列的操作。第一部分是log write，第二部分是install log，每一部分后面还跟着一个更新commit记录（注，也就是commit log和clean log）。

> 学生提问：可以从这里的记录找到一次文件操作的begin_op和end_op位置吗？
>
> Frans教授：大概可以知道。我们实际上不知道begin_op的位置，但是所有的文件系统操作都从begin_op开始。更新commit记录必然在end_op中，所以我们可以找到文件系统操作的end_op位置，之后就是begin_op（注，其实这里所有的操作都在end_op中，只需要区分每一次end_op的调用就可以找到begin_op）。
>

所以以上就是XV6中文件系统的logging介绍，即使是这么一个简单的logging系统也有一定的复杂度。

这里立刻可以想到的一个问题是，通过观察这些记录，这是一个很有效的实现吗？很明显不是的，因为数据被写了两次。如果我写一个大文件，我需要在磁盘中将这个大文件写两次。所以这必然不是一个高性能的实现，为了实现Crash safety我们将原本的性能降低了一倍。当你们去读ext3论文时，你们应该时刻思考如何避免这里的性能降低一倍的问题。

## 15.8 File system challenges
+ **接下来我将介绍一下三个复杂的地方或者也可以认为是三个挑战。**

#### 1. **缓存逐出（Cache Eviction）**
+ **问题**：  
在事务未完成时，缓存可能会逐出（evict）某些 block，如果这些 block 被写入到磁盘的实际位置，会违反 write ahead rule，从而破坏事务的原子性。
+ 假设transaction还在进行中，我们刚刚更新了block 45，正要更新下一个block，而整个buffer cache都满了并且决定撤回block 45。在buffer cache中撤回block 45意味着我们需要将其写入到磁盘的block 45位置。**如果我们这么做了的话，会破坏什么规则吗？**是的，如果将block 45写入到磁盘之后发生了crash，就会破坏transaction的原子性。这里也破坏了前面说过的**write ahead rule，write ahead rule**的含义：**你需要先将所有的block写入到log中，之后才能实际的更新文件系统block。所以buffer cache不能撤回任何还位于log的block。**
+ **解决方案**：
    - 使用 **bpin** 函数固定 block（pin），通过增加引用计数防止缓存逐出这些 block，如果引用计数不为0，那么buffer cache是不会撤回block cache的，相应的在将来的某个时间，所有的数据都写入到了log中，我们可以在cache中unpin block
    - 在事务完成后调用 **unpin** 释放 block。

#### 2. **文件系统操作必须适配log的大小**
+ **问题**：
    - XV6 的日志区域只有 30 个 block，所有文件系统操作必须在这个限制内完成。如果操作需要写入超过 30 个 block，会违反 write ahead rule。
    - （为什么XV6的log大小是30？因为30比任何一个文件系统操作涉及的写操作数都大，Robert和我看了一下所有的文件系统操作，发现都远小于30，所以就将XV6的log大小设为30。）
    - 你们可以想到什么样的文件系统操作会写很多很多个block吗？是的，写一个大文件。如果我们调用write系统调用并传入1M字节的数据，这对应了写1000个block，这看起来会有很严重的问题，因为这破坏了我们刚刚说的“文件系统操作必须适配log的大小”这条规则。
+ **解决方案**：
    - 将大的操作（如写入大文件）分割成多个小事务，每个事务分别进行处理，保证每个事务的日志都适配 30 个 block 的限制。
    - 这样虽然大写操作不是原子的，但文件系统状态始终是正确的。

让我们看一下file.c文件中的file_write函数。

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MSpMagokZL7AbkiMl0E%252F-MSqIkI-z69vFKPVZU5c%252Fimage.png%3Falt%3Dmedia%26token%3D13a3432f-b188-4931-ab03-c7b6c54f6cb4&width=768&dpr=4&quality=100&sign=7d98168e&sv=1)

当写入的块数超过30时，XV6会将一个大的写操作拆分成多个较小的写操作。

尽管整个写操作不是原子的，但这是可以接受的，因为write系统调用并不强制要求所有1000个块必须原子性地写入，只要保证文件系统的完整性即可。每个小写操作通过独立的事务完成，从而确保文件系统不会进入不一致状态。另外，由于在落盘前块需要被固定在缓存中，因此缓冲区缓存的大小必须大于日志的大小。

#### **3. 并发文件系统操作**
+ **问题**：
    - 并发的事务可能共享同一个日志区域。如果一个事务完成后提交，另一个事务还未完成，会导致提交部分事务的情况，破坏日志的作用。
    - 假设我们有一段log，和两个并发的执行的transaction，其中transaction t0在log的前半段记录，transaction t1在log的后半段记录。可能我们用完了log空间，但是任何一个transaction都还没完成。现在我们能提交任何一个transaction吗？我们不能，因为这样的话我们就提交了一个部分完成的transaction，这违背了write ahead rule，log本身也没有起到应该的作用。所以必须要保证多个并发transaction加在一起也适配log的大小。所以当我们还没有完成一个文件系统操作时，我们必须在确保可能写入的总的log数小于log区域的大小的前提下，才允许另一个文件系统操作开始。
+ **解决方案**：
    - 限制并发文件系统操作的总数。
    - **begin_op 和 end_op** 管理并发操作：
        * begin_op：检查是否有足够的日志空间，如果没有，则等待其他操作完成。
        * end_op：减少当前并发数，如果这是最后一个操作，则触发 commit。
    - 支持 **group commit**：
        * 将多个并发操作一起提交，保证日志顺序正确，事务依赖性不会被破坏。

> 学生提问：group commit有必要吗？不能当一个文件系统操作结束的时候就commit掉，然后再commit其他的操作吗？
>
> Frans教授：如果这样的话你需要非常非常小心。因为有一点我没有说得很清楚，我们需要保证write系统调用的顺序。如果一个read看到了一个write，再执行了一次write，那么第二个write必须要发生在第一个write之后。在log中的顺序，本身就反应了write系统调用的顺序，你不能改变log中write系统调用的执行顺序，因为这可能会导致对用户程序可见的奇怪的行为。所以必须以transaction发生的顺序commit它们，而一次性提交所有的操作总是比较安全的，这可以保证文件系统处于一个好的状态。
>

最后我们再回到最开始，看一下**begin_op**

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MSqOezkbZ42gI8NXtVb%252F-MSqojXjcfi2_tjsLVqB%252Fimage.png%3Falt%3Dmedia%26token%3D10af469f-7cf6-421f-b870-e57741a93aca&width=768&dpr=4&quality=100&sign=1d3883b8&sv=1)

首先，如果log正在commit过程中，那么就等到log提交完成，因为我们不能在install log的过程中写log；其次，如果当前操作是允许并发的操作个数的后一个，那么当前操作可能会超过log区域的大小，我们也需要sleep并等待所有之前的操作结束；最后，如果当前操作可以继续执行，需要将log的outstanding字段加1，最后再退出函数并执行文件系统操作。

+ 再次看一下end_op函数，

![](https://mit-public-courses-cn-translatio.gitbook.io/~gitbook/image?url=https%3A%2F%2F1977542228-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-legacy-files%2Fo%2Fassets%252F-MHZoT2b_bcLghjAOPsJ%252F-MSqOezkbZ42gI8NXtVb%252F-MSqrSxhs44dKKOqLBi6%252Fimage.png%3Falt%3Dmedia%26token%3D22d77e00-e33f-479f-b422-ba5985716fc6&width=768&dpr=4&quality=100&sign=fe0b1f44&sv=1)

在最开始首先会对log的outstanding字段减1，因为一个transaction正在结束；

其次检查committing状态，当前不可能在committing状态，所以如果是的话会触发panic；

如果当前操作是整个并发操作的最后一个的话（log.outstanding == 0），接下来立刻就会执行commit；

如果当前操作不是整个并发操作的最后一个的话，我们需要唤醒在begin_op中sleep的操作，让它们检查是不是能运行。

（注，这里的outstanding有点迷，它表示的是当前正在并发执行的文件系统操作的个数，MAXOPBLOCKS定义了一个操作最大可能涉及的block数量。在begin_op中，只要log空间还足够，就可以一直增加并发执行的文件系统操作。所以XV6是通过设定了MAXOPBLOCKS，再间接的限定支持的并发文件系统操作的个数）

所以，即使是XV6中这样一个简单的文件系统，也有一些复杂性和挑战。

### 最后总结：
这节课讨论的是使用logging来解决crash safety或者说多个步骤的文件系统操作的安全性。这种方式对于安全性来说没有问题，但是性能不咋地。

> 学生提问：前面说到cache size至少要跟log size一样大，如果它们一样大的话，并且log pin了30个block，其他操作就不能再进行了，因为buffer中没有额外的空间了。
>
> Frans教授：如果buffer cache中没有空间了，XV6会直接panic。这并不理想，实际上有点恐怖。所以我们在挑选buffer cache size的时候希望用一个不太可能导致这里问题的数字。这里为什么不能直接返回错误，而是要panic？因为很多文件系统操作都是多个步骤的操作，假设我们执行了两个write操作，但是第三个write操作找不到可用的cache空间，那么第三个操作无法完成，我们不能就直接返回错误，因为我们可能已经更新了一个目录的某个部分，为了保证文件系统的正确性，我们需要撤回之前的更新。所以如果log pin了30个block，并且buffer cache没有额外的空间了，会直接panic。当然这种情况不太会发生，只有一些极端情况才会发生。
>


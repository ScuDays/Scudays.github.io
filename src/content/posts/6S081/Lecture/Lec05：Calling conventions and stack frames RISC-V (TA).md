---
title: Lec05：Calling conventions and stack frames RISC-V (TA)
date: 2024-08-06 00:39:59
modify: 2024-12-22 16:40:59
author: days
category: 6S081
published: 2024-07-31
---
# <font style="color:#000000;">Lec05：Calling conventions and stack frames RISC-V (TA)</font>
## <font style="color:#000000;">5.1 C程序到汇编程序的转换</font>
> <font style="color:#000000;">没什么太多需要记笔记的</font>
>

## <font style="color:#000000;">5.2 RISC-V vs x86</font>
**<font style="color:#000000;background-color:#FBDE28;">RISC-V中的RISC是精简指令集（Reduced Instruction Set Computer）</font>****<font style="color:#000000;">的意思，</font>**

**<font style="color:#000000;">x8</font>****<font style="color:#000000;background-color:#FBDE28;">6通常被称为CISC，复杂指令集（Complex Instruction Set Computer）。</font>**

**<font style="color:#000000;">这两者之间有一些关键的区别：</font>**

1. **<font style="color:#000000;">首先是指令的数量。实际上，创造RISC-V的一个非常大的初衷就是因为Intel手册中指令数量太多了。x86-64指令介绍由3个文档组成，并且新的指令以每个月3条的速度在增加。因为x86-64是在1970年代发布的，所以我认为现在有多于15000条指令。RISC-V指令介绍由两个文档组成。在这节课中，不需要你们记住每一个RISC-V指令，但是如果你感兴趣或者你发现你不能理解某个具体的指令的话，在课程网站的参考页面有RISC-V指令的两个文档链接。这两个文档包含了RISC-V的指令集的所有信息，分别是240页和135页，相比x86的指令集文档要小得多的多。这是有关RISC-V比较好的一个方面。所以在RISC-V中，我们有更少的指令数量。</font>**
2. **<font style="color:#000000;">除此之外，RISC-V指令也更加简单。在x86-64中，很多指令都做了不止一件事情。这些指令中的每一条都执行了一系列复杂的操作并返回结果。但是RISC-V不会这样做，RISC-V的指令趋向于完成更简单的工作，相应的也消耗更少的CPU执行时间。这其实是设计人员的在底层设计时的取舍。并没有一些非常确定的原因说RISC比CISC更好。它们各自有各自的使用场景。</font>**
3. **<font style="color:#000000;">相比x86来说，RISC另一件有意思的事情是它是开源的。这是市场上唯一的一款开源指令集，这意味着任何人都可以为RISC-V开发主板。RISC-V是来自于UC-Berkly的一个研究项目，之后被大量的公司选中并做了支持，网上有这些公司的名单，许多大公司对于支持一个开源指令集都感兴趣。</font>**

<font style="color:#000000;"></font>

+ **<font style="color:#000000;">为什么 Intel 的指令集那么大？</font>**

**<font style="color:#000000;">Intel的指令集之所以这么大，是因为Intel对于向后兼容非常看重。所以一个现代的Intel处理器还可以运行30/40年前的指令。Intel并没有下线任何指令。而RISC-V提出的更晚，所以不存在历史包袱的问题。</font>**

+ **<font style="color:#000000;">RISC-V的特殊之处</font>**

**<font style="color:#000000;">它区分了Base Integer Instruction Set和Standard Extension Instruction Set。</font>**

**<font style="color:#000000;">Base Integer Instruction Set包含了所有的常用指令，比如add，mult。</font>**

**<font style="color:#000000;">除此之外，处理器还可以选择性的支持Standard Extension Instruction Set。</font>**

**<font style="color:#000000;">例如，一个处理器可以选择支持Standard Extension for Single-Precision Float-Point。</font>**

**<font style="color:#000000;">这种模式使得RISC-V更容易支持向后兼容。 </font>**

**<font style="color:#000000;">每一个RISC-V处理器可以声明支持了哪些扩展指令集，然后编译器可以根据支持的指令集来编译代码。</font>**<font style="color:#000000;">创建。</font>

## <font style="color:#000000;">5.3 gdb和汇编代码执行</font>
**<font style="color:#000000;">我们来看一些真实的汇编代码。</font>**

> **<font style="color:#000000;">提问：这里面.secion，.global，.text分别是什么意思？</font>**
>
> **<font style="color:#000000;">TA：global表示你可以在其他文件中调用这个函数。text表明这里的是代码，如果你还记得XV6中的图3.4，每个进程的page table中有一个区域是text，汇编代码中的text表明这部分是代码，并且位于page table的text区域中。text中保存的就是代码。</font>**
>
> ![|679](https://raw.githubusercontent.com/ScuDays/MyImg/master/8b82119f429df174871e208b46e393b8.jpeg)

![|768](https://raw.githubusercontent.com/ScuDays/MyImg/master/51a51c08c5fd7a1906160766544943b2.jpeg)

## <font style="color:#000000;">5.4 RISC-V寄存器</font>

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/6191616ebd37535e26016bcba4d1e7ea.jpeg)

+ **<font style="color:#000000;">寄存器的作用和重要性</font>**<font style="color:#000000;">：寄存器是CPU上用于存储数据的预定义位置，对于执行汇编代码尤为重要。寄存器比内存有更快的数据访问速度，因此在进行算术运算（如加减法）时，优先在寄存器上操作。数据首先从内存加载到寄存器，操作完成后，结果可以存储回内存或传递给其他寄存器。</font>
+ **<font style="color:#000000;">函数调用与寄存器</font>**<font style="color:#000000;">：特别指出a0到a7这些寄存器在函数调用中的作用，主要用于传递函数参数和返回值。如果一个函数的参数超过8个，则需要使用内存来传递额外的参数。</font>
+ **<font style="color:#000000;">ABI名字的使用</font>**<font style="color:#000000;">：在描述寄存器时，通常使用ABI名字（如a0-a7）而不是物理寄存器名（如x10, x11等），以增加代码的清晰度和标准化。特别在压缩指令（Compressed Instruction）中，部分寄存器（如s1）的使用是限定的。</font>

> + **<font style="color:#000000;">寄存器的保存规则（Caller Saved vs. Callee Saved）</font>**<font style="color:#000000;">：</font>
>     - **<font style="color:#000000;">Caller Saved</font>**<font style="color:#000000;">：调用方负责保存这些寄存器的值，因为被调用的函数可能会修改这些寄存器。</font><font style="color:#000000;">在函数调用的时候不会保存。</font>
>     - **<font style="color:#000000;">Callee Saved</font>**<font style="color:#000000;">：被调用的函数负责保存这些寄存器的值，以保证调用方的数据不被改变。</font><font style="color:#000000;">在函数调用的时候会保存</font>
>

+ **<font style="color:#000000;">寄存器的数据存储</font>**<font style="color:#000000;">：所有寄存器都是64位的。对于32位的数据，会根据数据是否有符号，在其前面补0或1，以使数据符合64位的要求。</font>
+ **<font style="color:#000000;">关于返回值和寄存器的分配</font>**<font style="color:#000000;">：对于大于64位的数据，如128位的long long类型，可以跨多个寄存器存储。一般来说，返回值默认存储在a0寄存器，但理论上也可以使用a1寄存器。</font>
+ **<font style="color:#000000;">寄存器的连续性和特殊情况</font>**<font style="color:#000000;">：s1寄存器与其他s寄存器分开的原因是其在压缩指令中的特殊应用。</font>

## <font style="color:#000000;">5.5 Stack 栈帧</font>

<font style="color:#000000;">下面是一个非常简单的栈的结构图，其中每一个区域都是一个Stack Frame，每执行一次函数调用就会产生一个Stack Frame。</font>

![|677](https://raw.githubusercontent.com/ScuDays/MyImg/master/49d659f4b057ab03e41519208241acb9.jpeg)

**<font style="color:#000000;">在一个进程中，进程有一个栈,进程中的每个函数调用都会创建一个栈帧，栈帧存储在进程的栈中，这些栈帧共同构成了进程的调用栈  </font>**

**<font style="color:#000000;">函数通过移动 Stack Pointer (函数的 stack)来完成Stack Frame的空间分配。</font>**

<font style="color:#000000;">因为栈总是向下增长，所以Stack是从高地址开始向低地址。</font>

<font style="color:#000000;">当我们想要创建一个新的Stack Frame的时候，总是对当前的Stack Pointer做减法。</font>

<font style="color:#000000;">一个函数的Stack Frame包含了保存的寄存器，本地变量。</font>

**<font style="color:#000000;">如果函数的参数多于8个，额外的参数会出现在Stack中。所以Stack Frame大小并不确定。但是有关Stack Frame有两件事情是确定的：</font>**

+ **<font style="color:#000000;">Return address总是会出现在Stack Frame的第一位</font>**
+ **<font style="color:#000000;">指向前一个Stack Frame的指针也会出现在栈中的固定位置</font>**

> **<font style="color:#000000;">有关Stack Frame中有两个重要的</font>****<font style="color:#000000;background-color:#FBDE28;">寄存器（并非储存在 Stack Frame 中的数据）</font>**
>
> + **<font style="color:#000000;">第一个是SP（Stack Pointer），它指向Stack的底部并代表了当前Stack Frame的位置。</font>**
> + **<font style="color:#000000;">第二个是FP（Frame Pointer），它指向当前Stack Frame的顶部。因为Return address和指向前一个Stack Frame的的指针都在当前Stack Frame的固定位置，所以可以通过当前的FP寄存器寻址到这两个数据。</font>**
> + **<font style="color:#000000;">我们保存前一个Stack Frame的指针的原因是为了让我们能跳转回去。所以当前函数返回时，我们可以将前一个Frame Pointer存储到FP寄存器中。所以我们使用Frame Pointer来操纵我们的Stack Frames，并确保我们总是指向正确的函数。</font>**
>

**<font style="color:#000000;">Stack Frame必须要被汇编代码创建，所以是编译器生成了汇编代码，进而创建了Stack Frame。</font>**

**<font style="color:#000000;">所以，在汇编代码中，函数的最开始你们通常可以看到Function prologue，之后是函数的本体，最后是Epilogue。这就是一个汇编函数通常的样子。</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/4afcc4ced6e7f617c0bbfb8b5e7fa46f.png)

---

> # <font style="color:#000000;">举例</font>
> ![|731](https://raw.githubusercontent.com/ScuDays/MyImg/master/08f66a6cc8af1689d17524887e42da69.jpeg)
>
> **<font style="color:#000000;">之前的 sum_to函数中，只有函数主体，并没有Stack Frame的内容。它这里能正常工作的原因是它足够简单，并且它是一个leaf函数。leaf函数是指不调用别的函数的函数，它的特别之处在于它不用担心保存自己的Return address或者任何其他的Caller Saved寄存器，因为它不会调用别的函数。</font>**
>
> **<font style="color:#000000;">而另一个函数sum_then_double就不是一个leaf函数了，这里你可以看到它调用了sum_to。</font>**
>
> ![](https://raw.githubusercontent.com/ScuDays/MyImg/master/771a9c043af82b2d6fc5e1d6157a1703.jpeg)
>
> **<font style="color:#000000;">所以在这个函数中，需要包含prologue。</font>**
>
> ![](https://raw.githubusercontent.com/ScuDays/MyImg/master/abce147d0f24159da3588d94553e36bf.jpeg)
>
> **<font style="color:#000000;">这里我们对Stack Pointer减16，这样我们为新的Stack Frame创建了16字节的空间。之后我们将Return address保存在Stack Pointer位置。</font>**
>
> **<font style="color:#000000;">之后就是调用sum_to并对结果乘以2。最后是Epilogue，</font>**
>
> ![](https://raw.githubusercontent.com/ScuDays/MyImg/master/2834cf40f21041bab1b3962af1dc71ec.jpeg)
>
> **<font style="color:#000000;">这里首先将Return address加载回ra寄存器，通过对Stack Pointer加16来删除刚刚创建的Stack Frame，最后ret从函数中退出。</font>**
>

> **<font style="color:#000000;background-color:#FBDE28;">这里我替大家问一个问题，如果我们删除掉Prologue和Epilogue，然后只剩下函数主体会发生什么？有人可以猜一下吗？</font>**
>
> **<font style="color:#000000;background-color:#E7E9E8;">学生回答：sum_then_double将不知道它应该返回的Return address。所以调用sum_to的时候，Return address被覆盖了，最终sum_to函数不能返回到它原本的调用位置。</font>**
>

> <font style="color:#000000;">是的，完全正确，我们可以看一下具体会发生什么。先在修改过的sum_then_double设置断点，然后执行sum_then_double。</font>
>
> ![|580](https://raw.githubusercontent.com/ScuDays/MyImg/master/7c47a646932a065b9bd9ed70a26c6ea3.jpeg)
>
> **<font style="color:#000000;">我们可以看到现在的ra寄存器是0x80006392，它指向demo2函数，也就是sum_then_double的调用函数。之后我们执行代码，调用了sum_to。</font>**
>
> ![|573](https://raw.githubusercontent.com/ScuDays/MyImg/master/776574b1628a33128389b46d39e4b329.jpeg)
>
> **<font style="color:#000000;">我们可以看到ra寄存器的值被sum_to重写成了0x800065f4，指向sum_then_double，这也合理，符合我们的预期。我们在函数sum_then_double中调用了sum_to，那么sum_to就应该要返回到sum_then_double。</font>**
>
> **<font style="color:#000000;">之后执行代码直到sum_then_double返回。如前面那位同学说的，因为没有恢复sum_then_double自己的Return address，现在的Return address仍然是sum_to对应的值，现在我们就会进入到一个无限循环中。</font>**
>
> **<font style="color:#000000;">我认为这是一个很好的例子用来展示为什么跟踪Caller和Callee寄存器是重要的。</font>**
>

> **<font style="color:#000000;">学生提问，为什在最开始要对sp寄存器减16？</font>**
>
> **<font style="color:#000000;">TA：是为了Stack Frame创建空间。减16相当于内存地址向前移16，这样对于我们自己的Stack Frame就有了空间，我们可以在那个空间存数据。我们并不想覆盖原来在Stack Pointer位置的数据。</font>**
>
> **<font style="color:#000000;">学生提问：为什么不减4呢？</font>**
>
> **<font style="color:#000000;">TA：我认为我们不需要减16那么多，但是4个也太少了，你至少需要减8，因为接下来要存的ra寄存器是64bit（8字节）。这里的习惯是用16字节，因为我们要存Return address和指向上一个Stack Frame的地址，只不过我们这里没有存指向上一个Stack Frame的地址。如果你看kernel.asm，你可以发现16个字节通常就是编译器的给的值。</font>**
>

---

> <font style="color:#000000;">接下来我们来看一些C代码。</font>
>
> ![|709](https://raw.githubusercontent.com/ScuDays/MyImg/master/885e56061b0048ffaa3dfcd9d718770f.jpeg)
>
> **<font style="color:#000000;">demo4函数里面调用了dummymain函数。我们在dummymain函数中设置一个断点，</font>**
>
> ![|625](https://raw.githubusercontent.com/ScuDays/MyImg/master/c58444c3d7d0db25c7a01a42d0d7906c.jpeg)
>
> **<font style="color:#000000;">现在我们在dummymain函数中。如果我们在gdb中输入info frame，可以看到有关当前Stack Frame许多有用的信息。</font>**
>
> ![](https://raw.githubusercontent.com/ScuDays/MyImg/master/6e3232435713e25fed5f7ba5e8aa82bf.jpeg)
>
> + **<font style="color:#000000;">Stack level 0，表明这是调用栈的最底层</font>**
> + **<font style="color:#000000;">pc，当前的程序计数器</font>**
> + **<font style="color:#000000;">saved pc，demo4的位置，表明当前函数要返回的位置</font>**
> + **<font style="color:#000000;">source language c，表明这是C代码</font>**
> + **<font style="color:#000000;">Arglist at，表明参数的起始地址。当前的参数都在寄存器中，可以看到argc=3，argv是一个地址</font>**
>
> **<font style="color:#000000;">如果输入backtrace（简写bt）可以看到从当前调用栈开始的所有Stack Frame。</font>**
>
> ![|727](https://raw.githubusercontent.com/ScuDays/MyImg/master/606c4cc5d04779e2767e87bc4e3616ae.jpeg)
>
> **<font style="color:#000000;">如果对某一个Stack Frame感兴趣，可以先定位到那个frame再输入info frame，假设对syscall的Stack Frame感兴趣。</font>**
>
> ![|682](https://raw.githubusercontent.com/ScuDays/MyImg/master/49d47e50905a44d287725cade4b4d3da.jpeg)
>
> **<font style="color:#000000;">在这个Stack Frame中有更多的信息，有一堆的Saved Registers，有一些本地变量等等。这些信息对于调试代码来说超级重要。</font>**
>


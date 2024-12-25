---
title: Lab：page tables
date: 2024-08-31 00:39:59
modify: 2024-12-22 16:40:21
author: days
category: 6S081
published: 2024-08-31
---
# Lab：page tables
## Print a page table (easy)
+ **目标：**
    - **实现打印页表的功能**
+ **目的：**
    - **方便之后的调试**
    - **加深对页表的理解**

**解决方式：**

**由于 RISC-V 中页表的设计是多级，我们只需要对每个 level 的页表进行递归即可。**

+ **得到 level2 的页表，遍历整个 level2**
+ **level2 每一项中遍历 level1，**
+ **level1 每一项中遍历 level0，得到实际物理地址，停止。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/08e7075231433ce2149508fd303d7179.png)

+ **解决代码**

```cpp
// 打印传递过来的pagetable里面的内容
// 分三级打印
// 例子：
// page table 0x0000000087f6e000
// ..0: pte 0x0000000021fda801 pa 0x0000000087f6a000
// .. ..0: pte 0x0000000021fda401 pa 0x0000000087f69000
// .. .. ..0: pte 0x0000000021fdac1f pa 0x0000000087f6b000
// .. .. ..1: pte 0x0000000021fda00f pa 0x0000000087f68000
// .. .. ..2: pte 0x0000000021fd9c1f pa 0x0000000087f67000
void vmprint(pagetable_t pagetable)
{
    printf("page table %p\n", pagetable);
    vmprint_help(pagetable, 0);
}
void vmprint_help(pagetable_t pagetable, int level)
{
    if (level == 3)
        return;
    for (int i = 0; i < 512; i++)
        {
            pte_t pte = pagetable[i];
            if (pte & PTE_V)
            {
                switch (level)
                    {
                        case 0:
                            printf("..%d: pte ", i);
                            break;
                        case 1:
                            printf(".. ..%d: pte ", i);
                            break;
                        case 2:
                            printf(".. .. ..%d: pte ", i);
                            break;
                    }
                printf("%p pa %p\n", pte, PTE2PA(pte));
                uint64 child = PTE2PA(pte);
                vmprint_help((pagetable_t)child, level + 1);
            }
            else
            {
                continue;
            }
        }
}
```

> **代码 37 行中的  **_**uint64 child = PTE2PA(pte) **_** 是什么？**
>
> **---------------------------------------------------------**
>
> **<font style="color:#117CEE;">#define PTE2PA(pte) (((pte) >> 10) << 12)</font>**
>
> **为什么要把 pte 向右移位 10 位，再向左移位 12 位呢**
>
> 1. **向右移位 10 位**
>
> ![](https://raw.githubusercontent.com/ScuDays/MyImg/master/08e7075231433ce2149508fd303d7179.png)
>
> **如图所示，整个 PTE 共有 54 位，左边 44 位为 PPN -- 即下一页表的地址；右边 10 位为 flags -- 即标志位。我们要找到下一级页表物理位置，显然与右边 10 位 flags 位没关系，所以向右移位 10 位，抹除标志位。**
>
> 2. **那为什么要向左移位 12 位**
>
> **我们要找到下一级页表的物理位置，而我们知道，在我们启用页表后，我们查找物理内存的最小单位就是一个页面大小，再根据具体页内偏移查找到具体数据。****<font style="background-color:#FBDE28;">在 xv6 中 RISC-V 的页面大小为 4KB，即 2</font>**<sup>**<font style="background-color:#FBDE28;">12</font>**</sup>**<font style="background-color:#FBDE28;"> ，所以我们向左移位 12 位得到页表地址</font>****。 **
>
> 3. **那如何得到具体的页表内偏移呢？**
>
> **虚拟地址中的前 12 位为 offset--即页表内偏移**
>

**示例页表：**

**各个页面都代表什么内容**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/a2f4b877f9bebea58d8609c87ef3eb45.jpeg)

## <font style="color:rgb(0, 0, 0);">A kernel page table per process (</font>[<font style="color:rgb(0, 0, 0);">hard</font>](https://pdos.csail.mit.edu/6.S081/2020/labs/guidance.html)<font style="color:rgb(0, 0, 0);">)</font>
### **目标：**
**修改内核来让每一个进程在内核中执行时使用它自己的页表（包含了内核页表的副本）。修改struct proc来为每一个进程维护一个内核页表，修改调度程序使得切换进程时也切换内核页表。每个进程的内核页表都应当与现有	的的全局内核页表完全一致。**

### 目的：
**<font style="color:rgb(51, 51, 51);">Xv6有一个单独的用于在内核中执行程序时的内核页表。内核页表直接映射（恒等映射）到物理地址，也就是说内核虚拟地址</font>****x****<font style="color:rgb(51, 51, 51);">映射到物理地址仍然是</font>**<font style="color:rgb(51, 51, 51);"> x</font>**<font style="color:rgb(51, 51, 51);">。</font>**

**<font style="color:rgb(51, 51, 51);">Xv6还为每个进程的用户地址空间提供了一个单独的页表，只包含该进程用户内存的映射，从虚拟地址0开始。</font>**

**<font style="color:rgb(51, 51, 51);">因为内核页表不包含这些映射，</font>****<font style="color:rgb(51, 51, 51);background-color:#FBDE28;">所以用户地址在内核中无效</font>****<font style="color:rgb(51, 51, 51);">。</font>****<font style="color:rgb(51, 51, 51);background-color:#FBDE28;">因此，当内核需要使用在系统调用中传递的用户指针（例如，传递给write()的缓冲区指针）时，内核必须首先将指针转换为物理地址。本节</font>**

**<font style="color:rgb(51, 51, 51);background-color:#FBDE28;">和下一节的目标是允许内核直接解引用用户指针。</font>**

### **解决方案：**
1. **第一种：copy 页表（我的方案）**
2. **第二种：share 页表（老师的方案）**

**两种方案都能够达到目的**

**第二种 share 方案会更简单，不需要关注哪些具体页表内映射的是什么内容，只需要复制即可。**

#### **第一种方案(我的方案):**
1. **直接进行复制，仿照 kvminit 初始化全局内核页表的方式，对每个进程的内核页表进行映射**

**代码中 Uvmmap 映射了：**

+ **UART0**
+ **VIRTI0**
+ **CLINT**
+ **PLIC**
+ **KERNBASE（kernel text）**
+ **etext(kerenl data and physical RAM that we'll use)**
+ **TRAMPOLINE(蹦床页面)**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/d9f98a22cff9181b13e6e6d7559570e0.png)

2. **然后对调度器进行更改**

**问题:下图代码中，kvmswitch(p->kpagetable),我们为什么要切换到当前进程的页表**

**回答:因为我们需要保证当前使用的页表不会被释放，如果我们继续使用之前的页表，那个页表可能回事一个等待被释放的页表，那么我们的 satp 寄存器将会指向一个 NULL 指针，这会引发错误。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/44e089f1e126c48e49ec361856f064c7.png)

## Simplify copyin/copyinstr（hard）
### **目标：**
**将定义在kernel/vm.c中的copyin的主题内容替换为对copyin_new的调用（在kernel/vmcopyin.c中定义）；对copyinstr和copyinstr_new执行相同的操作。为每个进程的内核页表添加用户地址映射，以便copyin_new和copyinstr_new工作。如果usertests正确运行并且所有make grade测试都通过，那么你就完成了此项作业。**

### **目的：**
1. **内核的copyin函数读取用户指针指向的内存。它通过将用户指针转换为内核可以直接解引用的物理地址来实现这一点。****<font style="background-color:#FBDE28;">copyin 会将数据从用户空间复制到内核空间，当数据很大的时候，这会消耗大量的性能，</font>**
2. **我们的工作是将用户空间的映射添加到每个进程的内核页表（上一节中创建），以允许copyin（和相关的字符串函数copyinstr）直接解引用用户指针（因为内核现在已经在使用每个进程的内核页表）。不需要通过复制，这样可以节省大量的性能。**

### **解决方案：**
**遍历两张页表，并设置标志位**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/be9aab8e6ef475e88486b99f623db512.png)

**问题：**

1. **为什么 fork()中  **

**copyUserPageToKernelPage(np->pagetable, np->userInKernelPageTable, 0, np->sz);**

**必须要用子进程用户页表复制到它的内核页表呢，不能用父进程的用户页表复制到子进程的用户页表吗？父进程 fork()得到的子进程，他们两个的页表不是一样的吗？**

**回答：其实父进程和子进程的用户页表确实一样，但是我们要考虑到在复制结束之前，父进程如果结束并释放了，那么父进程的页表也会被清空，这个时候复制函数拥有的是一个指向 NULL 的页表，这就是问题。**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/4ffa898314f82d6c3b99925b0bc21787.png)

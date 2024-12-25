---
title: Lab：lazy page allocation
date: 2024-10-12 00:39:58
modify: 2024-12-22 16:40:17
author: days
category: 6S081
published: 2024-12-22
---
# Lab：lazy page allocation
## 问题
**操作系统优化之一是惰性分配用户堆内存，即在真正需要时才分配。**

**以xv6系统为例，应用通过sbrk()请求内存，而内核负责分配物理内存并映射到虚拟空间。**

**然而，此过程对大内存请求耗时，即便小块分配也非瞬时。部分程序过量申请内存或预留未来使用(如稀疏数组)，加剧了效率问题。**

**为此，改进型内核采用惰性分配策略：sbrk()不立即分配物理内存，而是记录所请求的虚拟地址范围，并将其标记为未映射。首次访问这些虚拟页时，会触发 page fault 页错误，此时内核迅速介入，分配物理页、清零，并建立映射关系。本实验任务即在于为xv6实现这一惰性内存分配功能。**

## <font style="color:rgb(51, 51, 51);">Eliminate allocation from sbrk() (easy)</font>

:::warning

**你的首项任务是删除sbrk(n)系统调用中的页面分配代码（位于****_**sysproc.c**_****中的函数sys_sbrk()）。**

**sbrk(n)系统调用将进程的内存大小增加n个字节，然后返回新分配区域的开始部分（即旧的大小）。**

**新的sbrk(n)应该只将进程的大小（myproc()->sz）增加n，然后返回旧的大小。它不应该分配内存——因此您应该删除对growproc()的调用（但是您仍然需要增加进程的大小！）。**

:::

**试着猜猜这个修改的结果是什么：将会破坏什么？**

**进行此修改，启动xv6，并在shell中键入echo hi。你应该看到这样的输出：**

```plain
init: starting sh
$ echo hi
usertrap(): unexpected scause 0x000000000000000f pid=3
            sepc=0x0000000000001258 stval=0x0000000000004008
va=0x0000000000004000 pte=0x0000000000000000
panic: uvmunmap: not mapped

```

**“usertrap(): …”这条消息来自****_**trap.c**_****中的用户陷阱处理程序；它捕获了一个不知道如何处理的异常。请确保您了解发生此页面错误的原因。“stval=0x0..04008”表示导致页面错误的虚拟地址是0x4008。**

---

```c
uint64
sys_sbrk(void)
{
  int addr;
  int n;

  if(argint(0, &n) < 0)
    return -1;
  addr = myproc()->sz;

 #ifdef lab_lazy
    // 记录增加了sz的内存，但实际上并未映射
 if(n > 0){
  myproc()->sz += n;
 }
    // 这个是后两项任务中的
 else if(myproc()->sz + n > 0){
     myproc()->sz = uvmdealloc(myproc()->pagetable, addr, addr + n);
 }
 else{
  return -1;
 }

    // 不分配实际的内存
  //  if(growproc(n) < 0)
  //    return -1;
  #endif

  return addr;
}

```

## <font style="color:rgb(51, 51, 51);">Lazy allocation (moderate)</font>
**YOUR JOB**

**修改****_**trap.c**_****中的代码以响应来自用户空间的页面错误，方法是新分配一个物理页面并映射到发生错误的地址，然后返回到用户空间，让进程继续执行。您应该在生成“usertrap(): …”消息的printf调用之前添加代码。你可以修改任何其他xv6内核代码，以使echo hi正常工作。**

**提示：**** **

+ **你可以在usertrap()中查看r_scause()的返回值是否为13或15来判断该错误是否为页面错误**
+ **stval寄存器中保存了造成页面错误的虚拟地址，你可以通过r_stval()读取**
+ **参考****_**vm.c**_****中的uvmalloc()中的代码，那是一个sbrk()通过growproc()调用的函数。你将需要对kalloc()和mappages()进行调用**
+ **使用PGROUNDDOWN(va)将出错的虚拟地址向下舍入到页面边界**
+ **当前uvmunmap()会导致系统panic崩溃；请修改程序保证正常运行**
+ **如果内核崩溃，请在****_**kernel/kernel.asm**_****中查看sepc**
+ **使用pgtbl lab的vmprint函数打印页表的内容**
+ **如果您看到错误“incomplete type proc”，请include“spinlock.h”然后是“proc.h”。**

**如果一切正常，你的lazy allocation应该使echo hi正常运行。您应该至少有一个页面错误（因为延迟分配），也许有两个。**

---

**结果：**

```c
void usertrap(void)
{
    ...
  if (r_scause() == 8)
  {
    ...
  }
  else if ((which_dev = devintr()) != 0)
  {
    // ok
  }
#ifdef lab_lazy
    
  // 判断是否是页面错误, 如果是页错误导致的trap，进行处理
  else if ((r_scause() == 13) || (r_scause() == 15))
  {
    // 导致页面错误的虚拟地址
    uint64 error_va = r_stval();

    // printf("page fault %p\n", error_va);
    //  如果错误地址大于分配的虚拟内存大小,终止进程
    //  如果发生在用户栈下面的无效页面上发生的错误
    if (error_va >= p->sz || error_va <= PGROUNDDOWN(p->trapframe->sp))
    {
      p->killed = 1;
    }
    else
    {
      uint64 va = PGROUNDDOWN(error_va);
      uint64 mem = (uint64)kalloc();
      // 正确处理内存不足:如果 kalloc() 失败，则终止当前进程
      if (mem == 0)
      {
        p->killed = 1;
      }
      else
      {
        memset((uint64 *)mem, 0, PGSIZE);
        pagetable_t pagetable = p->pagetable;
        if (mappages(pagetable, va, PGSIZE, mem, PTE_W | PTE_R | PTE_U) != 0)
        {
          kfree((void *)mem);
          p->killed = 1;
        }
      }
    }
#endif
  }
  else
  {
    printf("usertrap(): unexpected scause %p pid=%d\n", r_scause(), p->pid);
    printf("            sepc=%p stval=%p\n", r_sepc(), r_stval());
    p->killed = 1;
  }
...
}
```

****

## <font style="color:rgb(51, 51, 51);">Lazytests and Usertests (moderate)</font>
**YOUR JOB**

**我们为您提供了lazytests，这是一个xv6用户程序，它测试一些可能会给您的惰性内存分配器带来压力的特定情况。修改内核代码，使所有lazytests和usertests都通过。**

+ **处理sbrk()参数为负的情况。**
+ **如果某个进程在高于sbrk()分配的任何虚拟内存地址上出现页错误，则终止该进程。**
+ **在fork()中正确处理父到子内存拷贝。**
+ **处理这种情形：进 程从sbrk()向系统调用（如read或write）传递有效地址，但尚未分配该地址的内存。**
+ **正确处理内存不足：如果在页面错误处理程序中执行kalloc()失败，则终止当前进程。**
+ **处理用户栈下面的无效页面上发生的错误。**
+ **处理sbrk()参数为负的情况。**

```c
int64
sys_sbrk(void)
{
  int addr;
  int n;

  if(argint(0, &n) < 0)
    return -1;
  addr = myproc()->sz;

 #ifdef lab_lazy
 if(n > 0){
  myproc()->sz += n;
 }
    // 处理变小的情况
 else if(myproc()->sz + n > 0){
    // 这里调用uvmdealloc()
    // 正常来说会因为懒分配会有分配了但实际未分配的问题
    // 在uvmdealloc()遇到调用uvmunmap()调用walk()发现没有对应的物理内存，就会panic
    // 所以我一开始觉得不能用uvmdealloc()，想了很久还是不懂
    // 然后参考发现先用uvmdealloc()，然后把会产生panic的continue了...我感觉是非常不严谨
  myproc()->sz = uvmdealloc(myproc()->pagetable, addr, addr + n);
 }
 else{
  return -1;
 }
  
  //  if(growproc(n) < 0)
  //    return -1;
  #endif

  return addr;
}
```

+ **如果某个进程在高于sbrk()分配的任何虚拟内存地址上出现页错误，则终止该进程。**

简单，没什么好说。

+ **在fork()中正确处理父到子内存拷贝。**

```c
// 直接把fork中拷贝内存的uvmcopy()中会panic的全部continue了
// 虽然是解法，但仍然感觉不严谨
int uvmcopy(pagetable_t old, pagetable_t new, uint64 sz)
{
    ...
#ifdef lab_lazy
    if ((pte = walk(old, i, 0)) == 0)
      continue;
    if ((*pte & PTE_V) == 0)
      continue;
#endif
#ifndef lab_lazy
    if ((pte = walk(old, i, 0)) == 0)
      panic("uvmcopy: pte should exist");
    if ((*pte & PTE_V) == 0)
      panic("uvmcopy: page not present");
#endif
    ...
}
```

+ **处理这种情形：进程从sbrk()向系统调用（如read或write）传递有效地址，但尚未分配该地址的内存。**

```c
这个比较难，一开始压根没看懂什么意思
觉得未分配有效地址那不是直接触发pagefault和之前流程一样再分配了不就行了吗？

后来发现系统调用压根不会进入
系统调用流程：
陷入内核==>usertrap中r_scause()==8的分支==>syscall()==>页面错误
==>内核恐慌(由于是内核代码发生的错误)panic

页面错误流程：
陷入内核==>usertrap中r_scause()==13||r_scause()==15的分支==>分配内存==>回到用户空间

所以需要另外处理，保证系统调用的时候，该地址分配了内存。
```

```c
地址被传入系统调用后，
系统调用会通过argaddr函数(kernel/syscall.c)从寄存器中读取，因此在这里添加物理内存分配的代码

int argaddr(int n, uint64 *ip)
{
  *ip = argraw(n);
    
#ifdef lab_lazy
  struct proc *p = myproc();
  // 处理向系统调用传入lazy allocation地址的情况
  if (walkaddr(p->pagetable, *ip) == 0)
  {
    if (PGROUNDDOWN(p->trapframe->sp) - 1 < *ip && *ip < p->sz)
    {
      char *pa = kalloc();
      if (pa == 0)
        return -1;
      memset(pa, 0, PGSIZE);
      if (mappages(p->pagetable, PGROUNDDOWN(*ip), PGSIZE, (uint64)pa, PTE_R | PTE_W | PTE_X | PTE_U) != 0)
      {
        kfree(pa);
        return -1;
      }
    }
    else
    {
      return -1;
    }
  }
#endif
    
  return 0;
}
```

+ **正确处理内存不足：如果在页面错误处理程序中执行kalloc()失败，则终止当前进程。**

简单

+ **处理用户栈下面的无效页面上发生的错误。**

简单，知道如何获取栈顶的值就行

```c
PGROUNDUP(p->trapframe->sp)
```


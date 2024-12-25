---
title: Lab：Copy-on-Write Fork for xv6
date: 2024-10-24 00:39:58
modify: 2024-12-22 16:40:15
author: days
category: 6S081
published: 2024-12-22
draft: false
---
# Lab：Copy-on-Write Fork for xv6
## <font style="color:rgb(51, 51, 51);">问题</font>
**在xv6中，fork()系统调用会复制父进程的所有用户空间内存到子进程中。当父进程很大时，这种复制过程会非常耗时，并且常常导致资源浪费，特别是当子进程紧接着执行exec()时，之前复制的大部分内存会被立即丢弃而未被使用。**

**然而，如果父子进程共享某些页面并且至少有一方对这些页面进行了写操作，则确实需要进行复制以保持各自数据的独立性。**

## <font style="color:rgb(51, 51, 51);">解决方案</font>
**Copy-on-Write (COW) 机制下的 fork() 操作，旨在延迟物理内存页的复制直到子进程实际需要独立内存时。**

**fork() 创建一个新进程，让其用户空间页表项指向父进程的物理内存页，同时将这些页表项设为只读。**

**当任一进程尝试写入这些共享且只读的页面时，会触发页面错误。内核识别这是由COW引起的后，会给该进程分配新的物理页，复制原内容到新页，并更新对应的页表项为可写状态。之后，程序可以继续执行之前被中断的写操作。**

**使用COW增加了管理用户空间内存的复杂性，因为同一物理页可能被多个进程引用。只有当所有引用该页的页表项都被移除后，才能安全释放此物理页。因此，系统需要跟踪每个物理页的引用计数，以防止过早回收仍在使用的内存。**

## <font style="color:rgb(51, 51, 51);">思路</font>
1. **<font style="color:rgb(51, 51, 51);">修改</font>****uvmcopy****<font style="background-color:rgb(247, 247, 247);">()</font>****<font style="color:rgb(51, 51, 51);">将父进程的物理页映射到子进程，而不是分配新页。在子进程和父进程的PTE中清除</font>****PTE_W****<font style="color:rgb(51, 51, 51);">标志。</font>**

**当 fork() 被调用的时候，uvmcopy 被调用来复制父进程的页表到子进程中，通过修改uvmcopy()****<font style="color:rgb(51, 51, 51);">实现延迟分配。</font>**

+ **<font style="color:rgb(51, 51, 51);">修改完之后，我们希望得到一个什么结果呢？</font>**

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/9de38f1b3ebdeeda7a800783d2f715a5.png)

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/a4700cdc0c67013cbcf3ef537f52b7b6.png)

**我们想要获得一个 scause 为 13 或者 15 的错误，因为我们清除了父进程和子进程页表的读权限，所以当程序访问数据的时候，理应会有该错误。**

```c
// Given a parent process's page table, copy
// its memory into a child's page table.
// Copies both the page table and the
// physical memory.
// returns 0 on success, -1 on failure.
// frees any allocated pages on failure.
int uvmcopy(pagetable_t old, pagetable_t new, uint64 sz)
{
    pte_t *pte;
    uint64 i;
    uint64 pa;
    uint flags;
    for (i = 0; i < sz; i += PGSIZE)
    {
        if ((pte = walk(old, i, 0)) == 0)
            panic("uvmcopy: pte should exist");
        if ((*pte & PTE_V) == 0)
            panic("uvmcopy: page not present");

        flags = PTE_FLAGS(*pte);
        pa = PTE2PA(*pte);

        if (flags & PTE_W)
        {
            // 问题:
       /** 
       原因:flags在下面代码mappage中需要用到，忘记修改flags导致了问题
       * 一直在怀疑错误代码和修复后的代码效果不是一样的吗？
       * 结果两个代码最后对PTE的权限位修改确实是一样的
       * 但问题就出在flags上了
       */
       // 源代码
       /* 
      * *pte = (*pte) & (~PTE_W);
      * pte = *pte | PTE_C;
      */
            flags = (flags | PTE_C) & ~PTE_W;
            *pte = PA2PTE(pa) | flags;
        }
        if (mappages(new, i, PGSIZE, pa, flags) != 0)
        {
            printf("uvmcopy: mappages\n");
            uvmunmap(new, 0, i / PGSIZE, 1);
            return -1;
        }
        PageRefIncrease((void *)pa);
    }
    return 0;
}
```

2. **修改usertrap()以识别页面错误。当COW页面出现页面错误时，使用kalloc()分配一个新页面，并将旧页面复制到新页面，然后将新页面添加到PTE中并设置PTE_W。**

**好了，我们在第一步中已经修改了****uvmcopy()****，并且产生了我们希望的错误。**

+ **现在我们需要处理在 usertrap()中处理这个错误。**

**当父进程或子进程访问数据的时候，就会产生错误并进入usertrap()，这个时候我们必须要为父进程或者子进程分配实际的内存，并将旧页面复制到新页面，并设置权限。**

```c
//
// handle an interrupt, exception, or system call from user space.
// called from trampoline.S
//
void usertrap(void)
{
    ...
  else if ((which_dev = devintr()) != 0){}
  else if (r_scause() == 13 || r_scause() == 15)
  {
    // 问题:
    /**  
     * 原因:
     * 1:cowAlloc中只考虑了是否是COW页面，
     * 2:但是这里页面错误情况中还需要考虑地址是否有效，
     * 3:是否确实有对应的页表.
     * */
    // 原本代码：
    // if(cowAlloc(p->pagetable, r_stval()) == 0)
    //   p->killed = 1;
    // 修正后代码
    uint64 fault_va = r_stval(); // 获取出错的虚拟地址
    // 1.通过cowpage()判断是否是cow页面并进行一些错误判断
    // 2.调用cowAlloc来分配页面并复制页面
    if (fault_va >= p->sz || cowpage(p->pagetable, fault_va) != 0 || cowAlloc(p->pagetable, fault_va) == 0)
      p->killed = 1;
  }
  ...
}
```

+ **cowpage()函数进行判断**
+ **cowAlloc()函数进行实际分配页表与复制**

```c
// 通过cowpage()判断是否是cow页面并进行一些错误判断
int cowpage(pagetable_t pagetable, uint64 va) {
  if(va >= MAXVA)
    return -1;
  pte_t* pte = walk(pagetable, va, 0);
  if(pte == 0)
    return -1;
  if((*pte & PTE_V) == 0)
    return -1;
  return (*pte & PTE_C ? 0 : -1);
}
//调用cowAlloc来分配页面并复制页面
// 对设置了 PTE_C 的页面进行分配
void* cowAlloc(pagetable_t pagetable, uint64 error_va)
{
   if(error_va >= MAXVA)
    return 0;
  char* mem;
  uint64 pa;
  uint flags;
  pte_t *pte;
  uint64 alloc_va;
  // 实际需要进行映射的虚拟地址
  alloc_va = PGROUNDDOWN(error_va);
  pte = walk(pagetable, alloc_va, 0);
  flags = PTE_FLAGS(*pte);
  pa = PTE2PA(*pte);
  if(pa == 0){
    return 0;
  }
  // 判断是否是 COW 页面
  if ((flags & PTE_C) != 0)
  {
    // 只有一个进程对此物理地址存在引用
    // 则直接修改PTE
    if (ref.cnt[pa / PGSIZE] == 1)
    {
      //  printf(" ==1\n");
      //  清除 COW 位并加上读权限
      *pte |= PTE_W;
      *pte &= ~PTE_C;
      return (void *)pa;
    }
    else
    {
      // printf("r_scause:%p  before:flags:%p\n", r_scause(), flags);
      // 清除 COW 位并加上读权限
      flags = flags | PTE_W;
      flags = (flags & (~PTE_C));
      mem = kalloc();
      if (mem == 0)
      {
        //printf("kalloc失败\n");
        return 0;
      }
      memmove(mem, (char*)pa, PGSIZE);
     // uvmunmap(pagetable, alloc_va, 1, 0);
       *pte &= ~PTE_V;
      if (mappages(pagetable, alloc_va, PGSIZE, (uint64)mem, flags) != 0)
      {
        printf("mappages失败\n");
        kfree((void *)mem);
        return 0;
      }
      // 减少原本指向的内存的引用
      // 问题:
      // 原因:copyout()中)调用cowAlloc()会存在需要释放内存的情况，但在usertrap()调用cowAlloc()处理中不会，
      // 一直考虑的是cowAlloc()中释放内存的情况，导致错误。
      // 原本代码：
      //PageRefDecrease((void*)(PGROUNDDOWN(pa)));
      // 修正后代码：
      kfree((char*)PGROUNDDOWN(pa));
      return mem;
    }
  }
  return 0;
}
```

3. **由于现在我们可能有多个进程指向同一个进程的情况，所以我们需要确保物理页在其最后一个PTE引用被移除时才被释放，这我们引入引用计数机制。**
+ 为每个物理页维护一个引用计数。
+ 当通过kalloc()分配新页时，设置其引用计数为1。
+ 在进程fork过程中如果子进程共享了父进程的页面，则增加这些页面的引用计数。每当有进程从自己的页表中移除对某个页面的引用时，相应地减少该页的引用计数。
+ 只有当某一页的引用计数降为0时，kfree()才能将此页归还到空闲列表中。  
引用计数可以通过一个整型数组来管理，其中数组大小和索引方式需要根据实际需求设计。例如，可以用物理地址除以4096作为数组索引来访问相应的引用计数，并且保证数组大小足够覆盖所有可能被分配出去的物理页的最大地址范围。

**我们维护一个页表引用数组的同时,我们需要为数组添加一个锁，****<font style="color:rgb(51, 51, 51);">这里使用自旋锁是考虑到这种情况：</font>**

> **<font style="color:rgb(51, 51, 51);">进程P1和P2共用内存M，M引用计数为2，此时CPU1要执行</font>**`**<font style="color:rgb(51, 51, 51);background-color:rgb(247, 247, 247);">fork</font>**`**<font style="color:rgb(51, 51, 51);">产生P1的子进程，CPU2要终止P2，那么假设两个CPU同时读取引用计数为2，执行完成后CPU1中保存的引用计数为3，CPU2保存的计数为1，那么后赋值的语句会覆盖掉先赋值的语句，从而产生错误</font>**
>

**（其实可以不需要添加一个锁，直接用kmem.lock也可以）**

```c
struct ref_stru
{
  struct spinlock lock;
  int cnt[PHYSTOP / PGSIZE]; // 引用计数
} ref;
```

+ **在kinit()中我们需要初始化锁**

```c
void kinit()
{
  initlock(&kmem.lock, "kmem");
  // memset(PageRefCount, 0, sizeof(sizeof(int) * PHYSTOP / PGSIZE));
  initlock(&ref.lock, "ref");
  freerange(end, (void *)PHYSTOP);
}
```

+ **当通过kalloc()分配新页时，设置其引用计数为1**

```c
// Allocate one 4096-byte page of physical memory.
// Returns a pointer that the kernel can use.
// Returns 0 if the memory cannot be allocated.
void *
kalloc(void)
{
  struct run *r;
  // 获得锁
  acquire(&kmem.lock);
  r = kmem.freelist;
  if (r){
    kmem.freelist = r->next;
    acquire(&ref.lock);
  // 将引用计数初始化为1
    ref.cnt[(uint64)r / PGSIZE] = 1;
    release(&ref.lock);
  }
  release(&kmem.lock);
  if (r)
  {
    memset((char *)r, 5, PGSIZE); // fill with junk 
  }
  return (void *)r;
}
```

+ **kfree()当引用为 1 的时候作为一个释放页表的函数，当引用大于 1 的时候可以作为一个给特定页表引用减一的函数**

```c
// Free the page of physical memory pointed at by v,
// which normally should have been returned by a
// call to kalloc().  (The exception is when
// initializing the allocator; see kinit above.)
void kfree(void *pa)
{
  struct run *r;
  if (((uint64)pa % PGSIZE) != 0 || (char *)pa < end || (uint64)pa >= PHYSTOP)
    panic("kfree");
    // 获取锁
  acquire(&ref.lock);
    // 判断页表引用减一后是否为0
    // 若为 0 则释放页表
  if (--ref.cnt[(uint64)pa / PGSIZE] == 0)
  {
    release(&ref.lock);
    // Fill with junk to catch dangling refs.
    r = (struct run *)pa;
    memset(pa, 1, PGSIZE);
    acquire(&kmem.lock);
    r->next = kmem.freelist;
    kmem.freelist = r;
    release(&kmem.lock);
  }
  else{
     release(&ref.lock);
  }
}
```

4. **<font style="color:rgb(51, 51, 51);">修改</font>****<font style="background-color:rgb(247, 247, 247);">copyout()</font>****<font style="color:rgb(51, 51, 51);">在遇到COW页面时使用与页面错误相同的方案。</font>**

```c
while(len > 0){
  va0 = PGROUNDDOWN(dstva);
  pa0 = walkaddr(pagetable, va0);
  // 处理COW页面的情况
  if(cowpage(pagetable, va0) == 0) {
    // 更换目标物理地址
    pa0 = (uint64)cowalloc(pagetable, va0);
  }
  if(pa0 == 0)
    return -1;
  ...
}
```

5. **修 bug，修改freerange()**

```c
void
freerange(void *pa_start, void *pa_end)
{
  char *p;
  p = (char*)PGROUNDUP((uint64)pa_start);
  for(; p + PGSIZE <= (char*)pa_end; p += PGSIZE) {
    // 在kfree中将会对cnt[]减1，这里要先设为1，否则就会减成负数
    ref.cnt[(uint64)p / PGSIZE] = 1;
    kfree(p);
  }
}
```


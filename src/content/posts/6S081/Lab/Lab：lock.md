---
title: Lab：lock
date: 2024-11-14 00:39:58
modify: 2024-12-22 16:40:18
author: days
category: 6S081
published: 2024-12-22
---
# Lab：lock
## Memory allocator(moderate)
+ **实验背景：**

**现在**** ****xv6中内存分配通过kalloc()进行分配，空闲内存由唯一一个keme维护，访问时需要获取keme的****🔒****，这导致了一个问题，当多个 CPU 中多个进程调用kalloc()进行分配内存时，会导致争用该锁的****🔒****，降低性能。**

+ **实验目标：**

**基本思想是为每个CPU维护一个空闲列表，每个列表都有自己的锁。每个CPU将在不同的列表上运行，不同CPU上的内存分配和释放可以并行运行。主要的挑战将是处理一个CPU的空闲列表为空，而另一个CPU的列表有空闲内存的情况；在这种情况下，一个CPU必须“窃取”另一个CPU空闲列表的一部分。窃取可能会引入锁争用，**

+ **代码：**
1. **将****kmem****定义为一个数组，包含****NCPU****个元素，即每个CPU对应一个**

```c
struct
{
  struct spinlock lock;
  struct run *freelist;
} kmem[NCPU];
```

2. **在kinit()初始化每一个锁**

```c
void kinit()
{
  for (int i = 0; i < NCPU; i++)
  {
    initlock(&kmem[i].lock, "kmem");
  }
  freerange(end, (void *)PHYSTOP);
}
```

3. **修改kfree()函数，分配时，获取的应该是当前CPU的keme的锁**

```c
void kfree(void *pa)
{
  struct run *r;

  if (((uint64)pa % PGSIZE) != 0 || (char *)pa < end || (uint64)pa >= PHYSTOP)
    panic("kfree");

  // Fill with junk to catch dangling refs.
  memset(pa, 1, PGSIZE);

  r = (struct run *)pa;
#infdef lab_lock_memory
// acquire(&kmem.lock);
// r->next = kmem.freelist;
// kmem.freelist = r;
// release(&kmem.lock);
#endif
#ifdef lab_lock_memory
  push_off();
  int id = cpuid();
  acquire(&kmem[id].lock);
  r->next = kmem[id].freelist;
  kmem[id].freelist = r;
  release(&kmem[id].lock);
  pop_off();
#endif
}
```

4. **修改kalloc()，分配内存的时候，先搜索当前freelist,如果当前 CPU 中没有空闲内存，则从别的 CPU 的freelist中“窃取”。**

```c
void *
kalloc(void)
{
// struct run *r;

// acquire(&kmem.lock);
// r = kmem.freelist;
// if(r)
//   kmem.freelist = r->next;
// release(&kmem.lock);

// if(r)
//   memset((char*)r, 5, PGSIZE); // fill with junk
// return (void*)r;
#ifdef lab_lock_memory
  push_off();
  int id = cpuid();
  struct run *r;
  acquire(&kmem[id].lock);
  r = kmem[id].freelist;
// 如果当前列表中还有空闲内存
  if (r)
  {
    kmem[id].freelist = r->next;
    release(&kmem[id].lock);
  }
// 如果没有，从别的CPU的keme中窃取
  else
  {
// 记得释放原本CPU的keme的🔒
    release(&kmem[id].lock);
    for (int i = 0; i < NCPU; i++)
    {
      if(i == id)continue;
      acquire(&kmem[i].lock);
      r = kmem[i].freelist;
      if (r)
      {
        kmem[i].freelist = r->next;
        release(&kmem[i].lock);
        break;
      }
      else
      {
// 当前CPU的keme搜索不到，记得释放🔒
        release(&kmem[i].lock);
      }
    }
  }
  if (r)
    memset((char *)r, 5, PGSIZE); // fill with junk
  pop_off();
  return (void *)r;
#endif
}
```

## Buffer cache(hard)
+ **实验背景：**

**现在 xv6中磁盘缓存块由bache进行管理，同样的，缓存块分配的时候，也需要先获取bache的****🔒****。 如果多个进程密集地使用文件系统，它们可能会争夺bcache.lock，导致性能的降低。**

**与上面的实验相比， 减少块缓存中的争用更复杂，因为bcache缓冲区的的确确在进程（以及CPU）之间共享。而kalloc，可以通过给每个CPU设置自己的分配器来消除大部分争用；这对块缓存不起作用。我们建议您使用每个哈希桶都有一个锁的哈希表在缓存中查找块号。**

+ **实验目标：**

**实验的目的是将缓冲区的分配与回收并行化以提高效率**

+ **思路**
1. **使用哈希表的方式来管理bcache**
2. **通过对每个桶对应一个锁的方式，实现并发的获取缓存块**
3. **桶内搜索的实现，选择在每个桶内维护一个 LRU 双向链表，这样既复用了原本的代码，又提高了寻找缓存块的速度，不需要遍历整个桶。**
+ **代码**
1. **修改struct bcache，添加struct HashBufferBucket，维护一个哈希表，我们并不删除 head 头节点，老师的提示中提示我们使用ticks来记录最近一次使用时间来进行 LRU 选择，但我们也可以直接维护**

```c
#ifdef lab_lock_buffer
struct HashBufferBucket
{
  struct buf head;      // 头节点
  struct spinlock lock; // 锁
}
struct
{
  struct spinlock lock;
  struct buf buf[NBUF];
  // 缓存区哈希表
  struct HashBufferBucket BufBucket[BucketNumber];
} bcache;
#endif
```

2. **通过 binit初始化桶**
    1. **先初始化每个桶的锁和头节点,头节点的head->prev、head->next指向自己，形成双向链表**
    2. **将所有空闲磁盘块缓存先放入bcache.BufBucket[0]中**

```c
void binit(void)
{

#ifndef lab_lock_buffer
  struct buf *b;
  initlock(&bcache.lock, "bcache");
  // Create linked list of buffers
  bcache.head.prev = &bcache.head;
  bcache.head.next = &bcache.head;
  for (b = bcache.buf; b < bcache.buf + NBUF; b++)
  {
    b->next = bcache.head.next;
    b->prev = &bcache.head;
    initsleeplock(&b->lock, "buffer");
    bcache.head.next->prev = b;
    bcache.head.next = b;
  }
#endif
#ifdef lab_lock_buffer
  char LockName[16];
  initlock(&bcache.lock, "bcache");
  // 初始化桶
  for (int i = 0; i < BucketNumber; i++)
  {
    // 初始化桶的锁
    snprintf(LockName, sizeof(LockName), "bcache_%d", i);
    initlock(&bcache.BufBucket[i].lock, LockName);
    // 初始化每个桶的头节点
    // 之所以采用这个头节点的方式，是为了复用源代码，方便编写
    bcache.BufBucket[i].head.prev = &bcache.BufBucket[i].head;
    bcache.BufBucket[i].head.next = &bcache.BufBucket[i].head;
  }
  struct buf *b;
  // 将所有的缓冲块都先放到哈希表的桶 0 当中
  for (b = bcache.buf; b < bcache.buf + NBUF; b++)
  {
    b->next = bcache.BufBucket[0].head.next;
    b->prev = &bcache.BufBucket[0].head;
    initsleeplock(&b->lock, "buffer");
    bcache.BufBucket[0].head.next->prev = b;
    bcache.BufBucket[0].head.next = b;
  }
#endif
}
```

3. **更改brelse，从获取bcache.lock改为获取对应的桶的bcache.BufBucket[i].lock**

```c
void brelse(struct buf *b)
{
  if (!holdingsleep(&b->lock))
    panic("brelse");

  releasesleep(&b->lock);

  int i = hashing(b->blockno);
  // acquire(&bcache.lock);
  acquire(&bcache.BufBucket[i].lock);
  b->refcnt--;
  // no one is waiting for it.
  if (b->refcnt == 0)
  {
    b->next->prev = b->prev;
    b->prev->next = b->next;
    b->next = bcache.BufBucket[i].head.next;
    b->prev = &bcache.BufBucket[i].head;
    bcache.BufBucket[i].head.next->prev = b;
    bcache.BufBucket[i].head.next = b;
  }

  release(&bcache.BufBucket[i].lock);
  // release(&bcache.lock);
}
```

4. **更改bget，当找不到指定的缓冲区时进行分配**
    1. **先去寻找指定的缓冲区，找不到进行分配**
    2. **分配的时候，由于每个桶都是一个 LRU 双向列表，所以只需要从每个桶的head往后找到第一个符合refnt==1的即可**
    3. **优先从当前桶寻找，如果没有就申请下一个桶的锁，并遍历该桶，找到后将该缓冲区从原来的桶移动到当前桶中，最多将所有桶都遍历完。**
+ **关键问题**
1. **寻找指定的缓冲区和进行分配必须是原子的，对于一个特定的块来说，我们开始在代码 11 行获取了这个桶的****🔒****，在最开始写代码的时候，我选择在寻找不到该磁盘块缓存的时候，先将这个桶的****🔒****释放，后面要的时候再获取，这就导致了一个问题：**
    1. **在释放了****🔒****到重新获取的时间内，另一个CPU以相同的参数调用了bget，同样寻找不到该磁盘块缓存，于是同样为这个磁盘块再去分配一个缓存块。**
    2. **最终导致一个磁盘块对应了两个缓冲区，破坏了最重要的不变量，即每个块最多缓存一个副本。导致usertests中的manywrites测试报错：panic: freeing free block**

```c
static struct buf *
bget(uint dev, uint blockno)
{
#ifdef lab_lock_buffer

  struct buf *b;
  // acquire(&bcache.lock);
  //  块应该在的桶
  uint TheBucketNumber = hashing(blockno);
  // 1：查看磁盘块是否已缓存
  acquire(&bcache.BufBucket[TheBucketNumber].lock);

  for (b = bcache.BufBucket[TheBucketNumber].head.next; b != &bcache.BufBucket[TheBucketNumber].head; b = b->next)
  // for (b = bcache.BufBucket[TheBucketNumber].head.prev; b != &bcache.BufBucket[TheBucketNumber].head; b = b->prev)
  {
    if (b->dev == dev && b->blockno == blockno)
    {
      b->refcnt++;
      release(&bcache.BufBucket[TheBucketNumber].lock);
      // release(&bcache.lock);
      acquiresleep(&b->lock);
      return b;
    }
  }
  /* 问题:*/
  /* 这里是一个很关键的问题，涉及到一个磁盘块对应了两个缓冲区
     一开始我是先释放了了应在桶的锁，后面需要的时候在获取
     这就会导致一个问题，
     如果我们释放了应在桶的锁，这个时候刚好，别的进程使用同样的参数调用bget(),
     进入应在桶搜索之后同样发现不存在，又会去寻找一个空闲的缓存块
     这样，就会出现同时有两个进程在为同一个磁盘块寻找空闲的缓存块，
     导致了一个磁盘块对应多个缓存块，出现 panic: freeing free block

  */
  // 错误！！！未缓存，先释放当前获取的桶的锁
  //  release(&bcache.BufBucket[TheBucketNumber].lock);

  // 2：磁盘块未缓存
  // 需要寻找一块未使用的缓存块来使用
  // 先在当前的桶中查找
  // 如果循环回到当前桶，说明全部桶中都没有空闲块
  for (int i = TheBucketNumber, cycle = 0; cycle != BucketNumber; i++, cycle++)
  {
    // 当前查询的桶的序号
    int j = hashing(i);
    // 获取所要查询的桶的锁
    // 如果当前查询桶与 TheBucketNumber 号桶不同，则要获取当前查询桶的锁
    // 如果相同，不能获取锁，不然会导致死锁
    if (j != TheBucketNumber)
    {
      acquire(&bcache.BufBucket[j].lock);
    }
    // 查询这个桶，双向列表，若重复到桶的头部，说明没有空闲的块，退出。
    for (b = bcache.BufBucket[j].head.prev; b != &bcache.BufBucket[j].head; b = b->prev)
    // for (b = bcache.BufBucket[j].head.next; b != &bcache.BufBucket[j].head; b = b->next)
    {
      if (b->refcnt == 0)
      {
        b->dev = dev;
        b->blockno = blockno;
        b->valid = 0;
        b->refcnt = 1;
        // 不管是哪个桶中的，移动到 TheBucketNumber 号桶中
        // 将该缓存块插入到应该插的桶的最后
        /*问题：*/
        // 错误所在，困扰了1-2个小时，就是把 TheBucketNumber 写成了 j
        b->next->prev = b->prev;
        b->prev->next = b->next;
        b->next = bcache.BufBucket[TheBucketNumber].head.next;
        b->prev = &bcache.BufBucket[TheBucketNumber].head;
        bcache.BufBucket[TheBucketNumber].head.next->prev = b;
        bcache.BufBucket[TheBucketNumber].head.next = b;
        if (j != TheBucketNumber)
        {
          release(&bcache.BufBucket[j].lock);
        }
        release(&bcache.BufBucket[TheBucketNumber].lock);

        acquiresleep(&b->lock);
        return b;
      }
    }
    if (j != TheBucketNumber)
    {
      release(&bcache.BufBucket[j].lock);
    }
  }
  for (b = bcache.BufBucket[TheBucketNumber].head.prev; b != &bcache.BufBucket[TheBucketNumber].head; b = b->prev)
  {
    printf("%d\n", b->refcnt);
  }
  panic("bget: no buffers");
#endif
}
```


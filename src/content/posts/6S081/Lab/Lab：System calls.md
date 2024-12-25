---
title: Lab：System calls
date: 2024-07-05 00:39:59
modify: 2024-12-22 16:40:23
author: days
category: 6S081
published: 2024-08-31
---
# Lab：System calls
> **实验目的：**
>
> **<font style="color:rgb(0, 0, 0);">弄懂系统调用的过程和如何添加一个系统调用，同时了解一下 xv6 的内部机制，如内存页的分配</font>**
>

+ **在 xv6 中如何实现一个系统调用？**

### 1. 用户空间函数调用
**用户空间的应用程序调用 ****trace**** 函数。这个函数的原型定义在 ****user/user.h**** 中：**

```c
int trace(int tracemask);
```

### 2. 用户空间的系统调用桩文件 (usys.S)
**当用户调用 ****trace**** 函数时，它会通过一个系统调用桩文件（****usys.S****）发出系统调用。**

**这个桩文件由 user/usys.pl 脚本生成。在 user/usys.pl 中，你添加了：**

```c
entry("trace");
```

**这个脚本会生成一个 trace 的系统调用桩，它实质上是使用 ecall 指令进行系统调用的汇编代码。**

**usys.pl 脚本会生成****<font style="color:#DF2A3F;"> usys.S 文件</font>****，其中包含每个系统调用的汇编桩代码。假设我们已经添加了 trace 系统调用，生成的 usys.S 文件可能包含如下内容：**

```c
.globl trace
trace:
li a7, SYS_trace     # Load the system call number into register a7
ecall                # Trigger the system call
ret                  # Return from the system call
```

**<font style="background-color:#FBDE28;">当我们在用户空间调用这个函数的时候，其实就是执行上面这个代码</font>**

### 3. 系统调用号 (syscall.h)
**在 ****kernel/syscall.h**** 中定义了系统调用号：**

```c
#define SYS_trace 22  // 假设22是新的系统调用号
```

**这个系统调用号唯一标识 ****trace**** 系统调用。**

### 4. 系统调用处理 (syscall 函数)
**当用户空间的程序调用 ****trace**** 函数时，系统会触发一个 ****ecall**** 指令，CPU 切换到内核模式，并跳转到 ****syscall**** 处理函数。****syscall**** 函数定义在 ****kernel/syscall.c**** 中：**

```c
void syscall(void)
{
    int num;
    struct proc *p = myproc();

    num = p->trapframe->a7;     //取出寄存器中的参数
    if(num > 0 && num < NELEM(syscalls) && syscalls[num]) {
        p->trapframe->a0 = syscalls[num](); //在这里根据参数选择对应的函数调用
        if(p->tracemask & (1 << num)) {
            printf("%d: syscall %s -> %d\n", p->pid, syscall_names[num], p->trapframe->a0);
        }
    } else {
        printf("%d %s: unknown sys call %d\n", p->pid, p->name, num);
        p->trapframe->a0 = -1;
    }
}
```

### 5. 系统调用表 (syscalls 数组)
**syscalls**** 是一个函数指针数组，其中每个元素指向一个具体的系统调用实现函数。你需要在 ****kernel/syscall.c**** 中将 ****SYS_trace**** 映射到 ****sys_trace**** 函数：**

```c
extern int sys_trace(void);

static int (*syscalls[])(void) = {
    ...
        [SYS_trace]   sys_trace,
};
```

### 6. 内核中的 sys_trace 实现
**最终，****syscall**** 函数会调用 ****sys_trace**** 函数，该函数在 ****kernel/sysproc.c**** 中实现：**

```c
uint64
sys_trace(void)
{
    int tracemask;
    if(argint(0, &tracemask) < 0)
        return -1;
    myproc()->tracemask = tracemask;
    return 0;
}
```

**sys_trace 使用 argint 函数从用户空间获取参数，并将其存储在当前进程的 tracemask 变量中。**

****


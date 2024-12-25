---
title: Lab：Multithreading
date: 2024-11-06 00:39:58
modify: 2024-12-22 16:40:20
author: days
category: 6S081
published: 2024-12-22
---
# Lab：Multithreading
**这个 lab 难度不大，没有什么太多值得关注的。**

+ **<font style="color:rgb(51, 51, 51);">Uthread: switching between threads (moderate)</font>**

**<font style="color:rgb(40, 91, 42);">工作是提出一个创建线程和保存/恢复寄存器以在线程之间切换的计划，并实现该计划。</font>**

+ **<font style="color:rgb(51, 51, 51);">Using threads (moderate)</font>**

**<font style="color:rgb(40, 91, 42);">工作是为哈希表实现互斥，保证键的插入是原子的</font>**

+ **<font style="color:rgb(51, 51, 51);">Barrier(moderate)</font>**

**<font style="color:rgb(40, 91, 42);">实现期望的屏障行为。除了在</font>****<font style="background-color:rgb(247, 247, 247);">ph</font>****<font style="color:rgb(40, 91, 42);">作业中看到的lock原语外，还需要以下新的pthread原语；详情请看</font>**[**<font style="color:rgb(40, 91, 42);">这里</font>**](https://pubs.opengroup.org/onlinepubs/007908799/xsh/pthread_cond_wait.html)**<font style="color:rgb(40, 91, 42);">和</font>**[**<font style="color:rgb(40, 91, 42);">这里</font>**](https://pubs.opengroup.org/onlinepubs/007908799/xsh/pthread_cond_broadcast.html)**<font style="color:rgb(40, 91, 42);">。</font>**

+ **// 在cond上进入睡眠，释放锁mutex，在醒来时重新获取**
+ **pthread_cond_wait(&cond, &mutex);**
+ **// 唤醒睡在cond的所有线程**
+ **pthread_cond_broadcast(&cond);**









## 

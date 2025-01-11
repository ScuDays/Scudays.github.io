---
title: imx6ull-Uboot
date: 2025-01-10 21:18:24
modify: 2025-01-10 21:49:15
author: days
category: Embedded Linux
published: 2025-01-10
draft: false
description: 讲解Uboot的启动过程
---
# 不同芯片的 uboot 不同
>参考 [imx6ull uboot启动流程 - 流水灯 - 博客园](https://www.cnblogs.com/god-of-death/p/16964389.html)

## uboot 内容不同
- NXP 提供的 uboot 经过编译最终烧写进存储介质中的是 uboot. imx 文件，
- 传统的比如  [S3C2440](https://baike.baidu.com/item/S3C2440AL-40/511244) 最终烧写进存储介质中的是 uboot. bin 文件。

imx 文件是在 bin 文件的基础上加上了一个头部。

头部的内容：

- IVT
- DCD：Device Configuration Data 设备配置数据(DCD)
	- DCD **表中包含了时钟寄存器的地址和寄存器的值**，引脚复用寄存器地址和寄存器的值，DDR 控制器的寄存器地址和寄存器的值。
	- imx6ull 内部的 BOOTROM (iROM) 程序会根据 DCD 表的内容打开时钟，初始化外部 DDR。
	- 这样boot ROM程序就会帮我们初始化DDR和其他硬件，然后才可以把bin程序读到DDR中并运行。
![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250111170742.png)

> [!NOTE]
> 因此 NXP 提供的 **uboot 代码**的汇编阶段没有初始化时钟和初始化 DDR 的相关汇编代码！
> 
> 这也是 NXP 的 uboot 和传统的三星提供的 uboot 的重大区别。

## 不同uboot 启动过程概要
### 主要区别

参考：[imx6ull uboot启动流程 - 流水灯 - 博客园](https://www.cnblogs.com/god-of-death/p/16964389.html)

> [!NOTE]
> 

1：MX6ULL 的 BOOTROM 程序会根据解析出来的链接起始地址在**一开始就把整个 Uboot 源码读取到 DDR 中去**，也就是说 Uboot 的**第一行代码就运行在 DDR 中**，这是不同于三星的传统 Uboot 的，**传统 Uboot 的第一句代码是运行在片内 SRAM 上的**。  
 2：由于上述的区别，Uboot 的重定位过程也就不同了，**IMX6ULL 的重定位过程是把 Uboot 整体从 DDR 的起始地址给挪到 DDR 的后端地址上去**，给 Linux 内核腾位置。

而三星 Uboot 中重定位是从 Flash 中把 Uboot 加载到 DDR 中去。

 除了上述提到了几点不同以外，Uboot 代码的其他部分功能基本大差不差。

### IMX6ULL Uboot 启动方式概要

不需要特地记忆具体都做了什么，只要知道整个不同阶段的流程以及运行在哪，如何进入下个阶段即可。

#### I .MX6ULL 的最终可烧写文件组成如下

①、 Image vector table，简称 IVT， IVT 里面包含了一系列的地址信息，这些地址信息在 ROM 中按照固定的地址存放着。

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250111164003.png)

②、 Boot data，启动数据，包含了镜像要拷贝到哪个地址，拷贝的大小是多少等。

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250111164030.png)

③、 Device configuration data，简称 DCD，设备配置信息，重点是 DDR 3 的初始化配置。

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250111164041.png)

#### BootRom
- 运行介质：CPU 片上 SRAM
	- 为什么: 在系统初始化时，cpu 只能访问可以直接寻址的存储器，如 ROM。而像 SPI FLASH 或 NAND FLASH 等外部存储器，都需要相应的驱动才可以访问，故在启动的最初阶段 cpu 无法访问。因此 cpu 执行的第一级启动镜像一般都是产商固化在 SOC 内部存储器（通常为 ROM）上。
- 功能：
	- imx6ull内部的BOOTROM程序会根据DCD表的内容打开时钟，初始化外部DDR。
		- **==因此NXP提供的uboot代码的汇编阶段没有初始化时钟和初始化DDR的相关汇编代码！==**==这也是NXP的uboot和传统的三星提供的uboot的重大区别。==
		- DCD中列出的是对某些寄存器的读写操作，我们可以在DCD中设置DDR控制器的寄存器值，可以在DCD中使用更优的参数设置必需的硬件。这样boot ROM程序就会帮我们初始化DDR和其他硬件，然后才可以把bin程序读到DDR中并运行。
	- IMX6ULL的BOOTROM程序会根据解析出来的链接起始地址在一开始就把整个Uboot源码读取到DDR中去，
		- 也就是说Uboot的第一行代码就运行在DDR中，这是不同于三星的传统Uboot的，**传统Uboot的第一句代码是运行在片内SRAM上的**。
#### BL1（汇编阶段）

源码 U-boot/arch/arm/cpu/xxx(armv7)/start.S

- 运行介质：外部 DDR
	- 为什么: IMX6ULL 中板子上电后 boot ROM程序会从启动设备上读出DCD数据，根据DCD 初始化了 ddr
- 功能：
	- 用汇编, 是因为机器刚开始就从某个内存地址开始取值操作, 这个时候内存没有初始化好, 汇编不需要堆栈
	- 硬件设备初始化(关闭看门口, 关中断, 设置CPU的速度和时钟频率, RAM初始化)
	- 为加载第二阶段的 Bootloader 的代码准备 RAM 空间(初始化RAM芯片,使可用, 调用lowlevel_init使外接SDRAM可用)
	- 复制 Bootloader 的第二阶段代码到 RAM 空间
	- 设置好栈
	- 跳转到第二阶段代码的入口 C 处
#### BL2（C 语言阶段）

源码 start.S 中, 初始化相关硬件之后, 会跳转 `_main`, 文件名: `arch/arm/lib/crt0.S`

- 运行介质：外部 DDR
	- 为什么: IMX 6 ULL 中板子上电后 boot ROM 程序会从启动设备上读出 DCD 数据，根据 DCD 初始化了 ddr
- 功能：
	- 初始化本阶段要使用的硬件设备(CPU中断, 系统时钟,定时器, 检查flash, 串口初始化, 检测系统内存映射)
	- 检测系统内存映射
	- 将内核映像和根文件系统映像从 flash 上读到 RAM 空间中
	- 为内核设置启动参数
	- 调用内核, 至少初始化串口用于调试

### 传统芯片 Uboot 启动方式概要

参考链接：[聊聊SOC启动（七） SPL启动分析 - 知乎](https://zhuanlan.zhihu.com/p/520189611) 

**U-Boot启动流程**：

- **三个阶段**：BootROM (bl0) --> SPL (bl1) --> U-Boot (bl2)

#### BL0(BootRom)

- 运行介质：CPU 片上SRAM
	- 为什么: 在系统初始化时，cpu 只能访问可以直接寻址的存储器，如 ROM。而像 SPI FLASH 或 NAND FLASH 等外部存储器，都需要相应的驱动才可以访问，故在启动的最初阶段 cpu 无法访问。因此 cpu 执行的第一级启动镜像一般都是产商固化在 SOC 内部存储器（通常为 ROM）上。
- 功能：主要负责加载 SPL (b1) 代码到芯片内部sram(Internal SRAM)中运行

#### BL1 (SPL)

- 运行介质：CPU 片上 SRAM
- 功能：初始化一些基本硬件
	- 1）设置cpu的状态，如cache，mmu，大小端设置等  
	- 2）准备c语言的执行环境，它包括设置栈指针和清空BSS段的内容  
	- 3）为GD分配内存空间  
	- 4）初始化RAM，并将BL2的代码拷贝到RAM中执行
	- **最关键的是初始化 ddr（外部 ram），然后加载 U-Boot(bl2) 到 ddr 上运行。**

#### BL2(Uboot)

- 运行介质：DDR 上
- 功能：Uboot 的完整功能，完成全面的硬件初始化和加载OS到内存中，接着运行OS.

	
## IMX6ULL Uboot 详细启动过程
### 一些主要问题
- 为什么 uboot 先是在 DDR 起始地址运行，再挪到后面，不能把 uboot 一开始就搬到后面去？
	- DDR 的起始地址（CONFIG\_SYS\_TEXT\_BASE）程序运行前就可以知道，重定位后的地址 gd->relocaddr 需要根据自身大小等信息计算出来
- 为什么 uboot 要挪到 DDR 后端地址去
	- 给 kernel 腾空间，kernel 运行的起始地址一般也是写死在 DDR 起始地址，因为这个地址对于 kernel 来说也是可以在运行前确定
### BootRom

### BL1（汇编阶段）

#### 一、设置 CPU 运行模式为 SVC 模式，关闭 FIQ 和 IRQ 中断。

设置成 SVC 模式是为了让 CPU 可以使用 SoC 的各种资源。

关中断因为启动过程不允许被打断，否则可能发生错误。

#### 二、设置 CP 15 协处理器的若干个寄存器，包括了设置异常向量表重定位并写入异常向量表的地址，失效 Cache，关闭 MMU，清除 Cache。

重定位异常向量表是因为，我们知道异常向量表的地址是 0 x 00000000，而 Uboot 是在 DDR 中运行的，DDR 的起始地址肯定不是 0 x 00000000，那么异常向量表必须重定位，这里只是配置好了重定位所需要的寄存器内容，实际的向量表重定位由后续的 relocate\_vector 函数完成。

关闭 MMU 是因为，MMU 负责虚拟地址到实际物理地址的转换，此时还没有加载操作系统，操作的都是实际物理地址，不需要 MMU 来转换。

清除 Cache 是因为，Cache 的内容是从 DDR 中缓存过来的，起始阶段 DDR 中还没有我们加载的内容，此时从 DDR 中缓存内容到 Cache 中，如果 CPU 从 Cache 中取数据可能导致错误。

#### 三、设置芯片内部的 IRAM

划分出一部分用来作为堆栈（方便后续调用 C 函数），划分一部分用来存储 uboot 中的重要变量：struct global\_data，这个结构体中包含了 cpu 的时钟频率信息，总线的时钟频率，uboot 重定位的地址，外部 DDR 的大小，Uboot 本身的大小的起始地址与终止地址，malloc 内存池的大小和位置等等众多重要数据，这些结构体内部的变量是在后续的 board\_init\_f () 函数中被初始化的，这些变量被初始化完成以后，Uboot 会根据其值进行重定位和一系列对外设的操作。

### BL2 (C 语言阶段)
#### 上述就是 imx 6 ull 的 uboot 在汇编阶段做的事情，下面在 arch/arm/lib/crt 0. S 文件中的\_main 函数中会调用若干个 C 函数。

一、board\_init\_f\_alloc\_reserve，用于设置内部 IRAM，划分出 malloc 区和存储 global\_data 变量的区域，并将这个变量的地址写入 R 9 寄存器中。

二、board\_init\_f\_init\_reserve，将上述函数划分的存储空间进行清零，把早期 malloc 区的地址写入到 global\_data 结构体变量的 malloc\_base 成员中去。

三、board\_init\_f，用于初始化部分外设和初始化 global\_data，这个函数里面有一个函数数组，函数数组中的函数会被依次执行，以此来实现初始化部分外设和 global\_data，这个函数数组在 common/board\_f.c 文件中定义。这里初始化的外设主要是串口，定时器，初始化 global\_data 主要是初始化其中的地址成员，比如 uboot 重定位以后的地址，malloc 区的基地址，新的 global\_data 变量的地址（因为刚开始 global\_data 是放在内部的 IRAM 中的）。这个函数执行以后，**外部 DDR 由原本的一张白纸变成了一段一段划分好的区域**，每一段用于存储不同的内容，如下图所示：

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250110211932.png)

四、 relocate\_code，就是重定位代码，这个重定位是从 DDR 到 DDR 的重定位，因为对于 imx 6 ull 来说，一开始 uboot 就被加载到了 DDR 上去运行，重定位就是为了把 DDR 前面的位置空出来以加载 Linux 内核，该函数定义在文件 arch/arm/lib/relocate. S 中。

五、 relocate\_vectors，重定位向量表。

六、board\_init\_r 函数，该函数和 board\_init\_f 一样，其中有一个函数数组，其中的函数会依次执行，这个函数的作用也是初始化外设，初始化那些在 board\_init\_f 函数中没有初始化过的外设，比如该函数会初始化中断，网络信息，控制台以及存储设备等等。注意：函数数组中有一个叫 board\_init 的函数，这个函数就是 imx 6 ull 的板级初始化函数，该函数定义在**board/freescale/mx 6 ullevk/mx 6 ullevk. c**文件中。我们进行 Uboot 移植的时候如果需要增减代码，基本就是在这个文件中进行代码的编辑。

### 至此，uboot 启动的主要部分就结束了。

### 接下来进入交互界面等待命令，主要包含三个函数。

一、run\_main\_loop ()--->main\_loop ()--->autoboot\_command ()，如果 stored\_bootdelay 秒（默认是 3 秒）倒计时按下任意键，进入 uboot 的命令模式，否则启动 Linux 内核。

二、cli\_loop，解析命令行命令函数，执行此函数说明进入 uboot 命令模式。

三、cmd\_process，执行相应的命令。

## uboot 启动 Linux 内核的过程：

### 自动模式

如果倒计时结束未按下任意键，会执行环境变量 bootcmd 内的命令启动 Linux 内核，由下图可知，bootcmd 的内容是宏**CONFIG\_BOOTCOMMAND**定义的

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250110214757.png)

而 CONFIG\_BOOTCOMMAND 是在 XXX\_defconfig 内定义的

 ![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250110214809.png)

 run findfdt，使用的是 uboot 的 run 命令来运行 findfdt， findfdt 是 NXP 自行添加的环境变量，定义如下图。 findfdt 是用来查找开发板对应的设备树文件 (. dtb)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250110214816.png)

最终分析下来，CONFIG\_BOOTCOMMAND 干的事情浓缩为以下四步：

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250110214823.png)

 CONFIG\_BOOTCOMMAND 还干了一件事，设置环境变量 bootargs，传递给 linux kernel

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250110214831.png)

root=/dev/mmcblk 1 p 2”表示根文件系统存储在 /dev/mmcblk 1 p 2 中（即 SD 卡控制器 2 控制的 SD 卡或 EMMC 等设备的分区 2）

### 命令模式

一般进入到 uboot 命令以后，我们会使用 tftp 命令或者 nfs 命令把 zImage 加载到 DDR 中去，然后使用 bootz 命令启动，使用 bootz 命令就调用了第一个函数。

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250110214840.png)

do\_bootz：这个函数主要干三件事。

第一，调用 bootz\_start 函数，这个函数会调用 do\_bootm\_states 执行 BOOTM\_STATE\_START 阶段；

设置 images 的 ep 变量，即系统镜像的地址。

调用 bootz\_setup 去验证镜像；最后调用 bootm\_find\_images 查找设备树文件，放在 images->ft\_addr 成员变量中。

第二，关中断

第三，设置 images 结构体变量的 os 成员，这个成员也是个结构体变量，设置它为 IN\_OS\_LINUX。然后执行 do\_bootm\_states 函数，该函数使用参数标识不同的启动阶段，此时的启动阶段为 BOOTM\_STATE\_OS\_PREP | BOOTM\_STATE\_OS\_FAKE\_GO |BOOTM\_STATE\_OS\_GO。

do\_bootm\_states 中会根据 images. os. os 这个系统类型来查找对应的系统启动函数，这里找到的是 do\_bootm\_linux；do\_bootm\_linux 函数最终会调用 boot\_jump\_linux 函数，这是 uboot 跳转到 linux 执行的最后一个函数。

boot\_jump\_linux 函数调用了一个叫做 kernel\_entry 的函数，这个函数是 Linux 内核定义的，kernel\_entry 是 Linux 内核镜像文件的第一行代码，地址为 images->ep，该函数有三个参数，第一个参数是 0，第二个参数是机器 ID，第三个参数是 ATAGS 或者设备树首地址。

一旦开始执行 kernel\_entry，uboot 的生命周期就结束了。

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250110214848.png)

参考资料——《正点原子 Linux 驱动开发手册》

## 具体代码分析


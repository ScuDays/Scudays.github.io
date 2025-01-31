---
title: Linux的设备模型
date: 2025-01-31 12:14:26
modify: 2025-01-31 12:14:26
author: days
category: Embedded Linux
published: 2025-01-31
draft: false
description: Linux的设备模型
---
# Linux 的设备模型

参考[6. Linux的设备模型 — [野火]嵌入式Linux驱动开发实战指南——基于i.MX6ULL系列 文档](https://doc.embedfire.com/linux/imx6/driver/zh/latest/linux_driver/linux_device_model.html)

## 一.前言

我们前面直接编写字符设备驱动有个固定的模式，它们之间的大致流程可以总结如下：

- 实现入口函数xxx_init()和卸载函数xxx_exit()
- 申请设备号 register_chrdev_region()
- 初始化字符设备，cdev_init函数、cdev_add函数
- 硬件初始化，如时钟寄存器配置使能，GPIO设置为输入输出模式等。
- 构建file_operation结构体内容，实现硬件各个相关的操作
- 在终端上使用mknod根据设备号来进行创建设备文件(节点) (也可以在驱动使用class_create创建设备类、在类的下面device_create创建设备节点)

在Linux开发驱动，只要能够掌握了这些“套路”，开发一个驱动便不是难事。

在内核源码的drivers中存放了大量的设备驱动代码， 在我们写驱动之前先查看这里的内容，说不定可以在这些目录找到想要的驱动代码。如图所示：

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250131122030.png)

- 根据步骤编写驱动代码简单粗暴，但存在着问题：

硬件的信息和驱动代码混合了，当硬件信息稍微变化，这个驱动代码就得重新修改才能使用，这显然是不合理的。

- 解决方案：

Linux引入了设备驱动模型分层的概念，将我们编写的驱动代码分成了两块：设备与驱动。设备负责提供硬件资源而驱动代码负责去使用这些设备提供的硬件资源。并由总线将它们联系起来。这样子就构成以下图形中的关系。

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250131122610.png)

## 二.设备模型基础

Linux设备模型是内核中用于管理和组织硬件设备的一套框架，它将硬件设备抽象为软件可以操作的对象，实现了设备与驱动的分离。设备模型通过几个关键的数据结构来反映系统中总线、设备以及驱动的工作状况，主要包括：

- **设备(device)** ：挂载在某个总线的物理设备，负责提供硬件资源；
- **驱动(driver)** ：与特定设备相关的软件，负责初始化该设备以及提供一些操作该设备的操作方式；
- **总线（bus)** ：负责管理挂载对应总线的设备以及驱动；
- **类(class)** ：对于具有相同功能的设备，归结到一种类别，进行分类管理
## 三、sysfs文件系统

sysfs是Linux内核提供的一种文件系统，用于将内核中的设备和驱动信息导出到用户空间。在根文件系统中的`/sys`目录下，记录了各个设备之间的关系和属性，主要包括以下重要目录：

- **/sys/bus**：每个子目录代表一种注册好的总线类型，包含`devices`和`drivers`两个子目录，分别存放该总线下的设备和驱动。
	- devices下是该总线类型下的所有设备，这些设备都是符号链接指向真正的设备 (/sys/devices/下)。如下图 bus下的 usb 总线中的 device 则是 Devices目录下/pci()/dev 0:10/usb2的符号链接。
	- 而drivers下是所有注册在这个总线上的驱动，每个driver子目录下是一些可以观察和修改的driver参数。
- **/sys/devices**：全局设备结构体系，包含所有被发现并注册在各种总线上的物理设备，/sys/devices是内核对系统中所有设备的分层次表达模型， 也是/sys文件系统管理设备的最重要的目录结构
- **/sys/class**：按照设备功能分类的设备模型，每种设备都具有特定的功能，归类到相应的目录下。按照设备功能分类的设备模型， 每种设备都具有自己特定的功能，比如：鼠标的功能是作为人机交互的输入，按照设备功能分类无论它挂载在哪条总线上都是归类到/sys/class/input下。
![image.png|526](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250131124554.png)
![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250131170846.png)
在总线上管理着两个链表，分别管理着设备和驱动，当我们向系统注册一个驱动时，便会向驱动的管理链表插入我们的新驱动，同样当我们向系统注册一个设备时，便会向设备的管理链表插入我们的新设备。
在插入的同时总线会执行一个 bus_type 结构体中 match 的方法对新插入的设备/驱动进行匹配。 (有多种匹配方式，最简单的就是使用名字相同进行匹配)。
- 在匹配成功的时候会调用驱动 device_driver 结构体中 probe 方法 (通常在 probe 中获取设备资源，具体的功能可由驱动编写人员自定义) ;
- 在移除设备或驱动时，会调用 device_driver 结构体中的 remove 方法；
## 四、总线（bus）

### （一）总线的概念

总线是连接处理器和设备之间的桥梁，代表着同类设备需要共同遵守的工作时序。大部分设备依靠总线进行通信，例如I2C、USB等。

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250131171347.png)

### （二）总线有关代码

在内核中使用结构体bus_type来表示总线，如下所示：

```c
struct bus_type {
    const char      *name;
    const char      *dev_name;
    struct device       *dev_root;
    struct device_attribute *dev_attrs; /* use dev_groups instead */
    const struct attribute_group **bus_groups;
    const struct attribute_group **dev_groups;
    const struct attribute_group **drv_groups;
// match函数
// 完成设备和驱动之间匹配
    int (*match)(struct device *dev, struct device_driver *drv);
    int (*uevent)(struct device *dev, struct kobj_uevent_env *env);
    int (*probe)(struct device *dev);
    int (*remove)(struct device *dev);
    void (*shutdown)(struct device *dev);
    int (*online)(struct device *dev);
    int (*offline)(struct device *dev);
    int (*suspend)(struct device *dev, pm_message_t state);
    int (*resume)(struct device *dev);
    const struct dev_pm_ops *pm;
    const struct iommu_ops *iommu_ops;
    struct subsys_private *p;
    struct lock_class_key lock_key;
};

```
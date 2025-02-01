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

参考[Linux的设备模型—[野火]—基于i.MX6UL](https://doc.embedfire.com/linux/imx6/driver/zh/latest/linux_driver/linux_device_model.html)

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
## 四、总线 (bus)

### （一）总线概念

总线是连接处理器和设备之间的桥梁，代表着同类设备需要共同遵守的工作时序。大部分设备依靠总线进行通信，例如I2C、USB等。

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250131171347.png)

### （二）总线有关代码
#### 数据结构

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
- name :指定总线的名称，当新注册一种总线类型时，会在/sys/bus目录创建一个新的目录，目录名就是该参数的值；
- drvgroups、devgroups、busgroups :分别表示驱动、设备以及总线的属性。这些属性可以是内部变量、字符串等等。通常会在对应的/sys目录下在以文件的形式存在，对于驱动而言，在目录/sys/bus//driver/存放了设备的默认属性；设备则在目录/sys/bus//devices/中。这些文件一般是可读写的，用户可以通过读写操作来获取和设置这些attribute的值。
- match :当向总线注册一个新的设备或者是新的驱动时，会调用该回调函数。该回调函数主要负责判断是否有注册了的驱动适合新的设备，或者新的驱动能否驱动总线上已注册但没有驱动匹配的设备；
- uevent :总线上的设备发生添加、移除或者其它动作时，就会调用该函数，来通知驱动做出相应的对策。
- probe :当总线将设备以及驱动相匹配之后，执行该回调函数,最终会调用驱动提供的probe函数。
- remove :当设备从总线移除时，调用该回调函数；
- suspend、resume :电源管理的相关函数，当总线进入睡眠模式时，会调用suspend回调函数；而resume回调函数则是在唤醒总线的状态下执行；
- pm :电源管理的结构体，存放了一系列跟总线电源管理有关的函数，与devicedriver结构体中的pmops有关；
- p :该结构体用于存放特定的私有数据，其成员klistdevices和klist_drivers记录了挂载在该总线的设备和驱动；
#### 注册/注销总线
- 内核中提供了bus_register函数来注册总线  (/drivers/base/bus. c）
``` 
int bus_register(struct bus_type *bus);
```
**参数：** **bus**: bus_type 类型的结构体指针
**返回值：**
- **成功：** 0
- **失败：** 负数
***
- 内核中提供了bus_unregister函数来注销总线 (/drivers/base/bus.c)
```
void bus_unregister(struct bus_type *bus);
```
**参数：** **bus** :bus_type类型的结构体指针
**返回值：** **无**

当我们成功注册总线时，会在/sys/bus/目录下创建一个新目录，目录名为我们新注册的总线名。bus目录中包含了当前系统中已经注册了的所有总线，例如i2c，spi，platform等。我们看到每个总线目录都拥有两个子目录devices和drivers， 分别记录着挂载在该总线的所有设备以及驱动。

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250131233643.png)

## 五、设备
### （一）设备概念
- /dev:
	- 设备文件存储目录，应用程序通过对这些文件的读写和控制，可以访问实际的设备；
- /sys/devices 
	- 实际存放device和driver的，按照设备挂接的总线类型，组织成层次结构，保存了系统所有的设备；是文件系统管理设备的最重要的目录结构；
	- devices 中的所有设备都是连接于某种总线之下，每一种总线之下可以找到每一个具体设备的符号链接，它也是构成 Linux 统一设备模型的重要部分；
- /sys/dev 
	- 有两个子目录，block 和 char，存放的是块设备和字符设备的主次号码，形式为 (major:minor)，它指向 /sys/devices 目录下的设备。
![image.png|545](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250201115445.png)![image.png|353](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250201115609.png)


***

1:/sys/dev 和/sys/devices 区别

- /sys/dev: 给应用程序使用，设备文件存储目录，应用程序通过对这些文件的读写和控制，可以访问实际的设备;
- /sys/devices: 给内核使用，按照设备挂接的总线类型，组织成层次结构，保存了系统所有的设备；是文件系统管理设备的最重要的目录结构

2: 为什么/sys/dev 中只有块设备和字符设备

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250201114456.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250201114513.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250201114524.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250201114531.png)

### （二）设备有关代码

#### 数据结构

内核使用device结构体来描述我们的物理设备，如下所示:

```c
struct device {
		const char *init_name;
        struct device           *parent;
        struct bus_type *bus;
        struct device_driver *driver;
        void            *platform_data;
        void            *driver_data;
        struct device_node      *of_node;
        dev_t                   devt;
        struct class            *class;
		void (*release)(struct device *dev);
        const struct attribute_group **groups;  /* optional groups */
		struct device_private   *p;
};
```

- **init_name** :指定该设备的名称，总线匹配时，一般会根据比较名字，来进行配对；
- **parent** :表示该设备的父对象，前面提到过，旧版本的设备之间没有任何关联，引入Linux设备模型之后，设备之间呈树状结构，便于管理各种设备；
- **bus** :表示该设备依赖于哪个总线，当我们注册设备时，内核便会将该设备注册到对应的总线。
- **of_node** :存放设备树中匹配的设备节点。当内核使能设备树，总线负责将驱动的of_match_table以及设备树的compatible属性进行比较之后，将匹配的节点保存到该变量。
- **platform_data** :特定设备的私有数据，通常定义在板级文件中；
- **driver_data** :同上，驱动层可通过dev_set/get_drvdata函数来获取该成员；
- **class** :指向了该设备对应类，开篇我们提到的触摸，鼠标以及键盘等设备，对于计算机而言，他们都具有相同的功能，都归属于输入设备。我们可以在/sys/class目录下对应的类找到该设备，如input、leds、pwm等目录;
- **dev** :dev_t类型变量，字符设备章节提及过，它是用于标识设备的设备号，该变量主要用于向/sys目录中导出对应的设备。
- **release** :回调函数，当设备被注销时，会调用该函数。如果我们没定义该函数时，移除设备时，会提示“Device ‘xxxx’ does not have a release() function, it is broken and must be fixed”的错误。
- **group** :指向struct attribute_group类型的指针，指定该设备的属性；

 #### 注册/注销设备

- 内核中提供了 device_register 函数来注册设备  (/driver/base/core.c）
``` 
int device_register(struct device *dev);
```
**参数：** **dev** :struct device结构体类型指针
**返回值：**
- **成功：** 0
- **失败：** 负数
***

- 内核中提供了 device_unregister 函数来注销设备  (/driver/base/core. c）
``` 
void device_unregister(struct device *dev);
```
**参数：** **dev** :struct device结构体类型指针
**返回值：** **无**
***

当成功注册总线时，会在/sys/bus目录下创建对应总线的目录，该目录下有两个子目录，分别是drivers和devices， 我们使用device_register注册的设备从属于某个总线时，该总线的devices目录下便会存在该设备文件。

## 六、驱动

### （一）驱动有关代码

#### 数据结构

在内核中，使用device_driver结构体来描述我们的驱动，如下所示：

```c
struct device_driver {
        const char              *name;
        struct bus_type         *bus;
        struct module           *owner;
        const char              *mod_name;      /* used for built-in modules */
        bool suppress_bind_attrs;       /* disables bind/unbind via sysfs */
        const struct of_device_id       *of_match_table;
        const struct acpi_device_id     *acpi_match_table;
        int (*probe) (struct device *dev);
        int (*remove) (struct device *dev);
        const struct attribute_group **groups;
        struct driver_private *p;
};
```
- **name** :指定驱动名称，总线进行匹配时，利用该成员与设备名进行比较；
    
- **bus** :表示该驱动依赖于哪个总线，内核需要保证在驱动执行之前，对应的总线能够正常工作；
    
- **suppress_bind_attrs** :布尔量，用于指定是否通过sysfs导出bind与unbind文件，bind与unbind文件是驱动用于绑定/解绑关联的设备。
	
- **owner** :表示该驱动的拥有者，一般设置为THIS_MODULE；
    
- **of_match_table** :指定该驱动支持的设备类型。当内核使能设备树时，会利用该成员与设备树中的compatible属性进行比较。
    
- **remove** :当设备从操作系统中拔出或者是系统重启时，会调用该回调函数；
    
- **probe** :当驱动以及设备匹配后，会执行该回调函数，对设备进行初始化。通常的代码，都是以main函数开始执行的，但是在内核的驱动代码，都是从probe函数开始的。
    
- **group** :指向struct attribute_group类型的指针，指定该驱动的属性；
#### 注册/注销驱动

内核提供了driver_register函数以及driver_unregister函数来注册/注销驱动，成功注册的驱动会记录在/sys/bus/\<bus\>/drivers目录，函数原型如下所示：

- 注册驱动
```c
int driver_register(struct device_driver *drv);
```
**参数：** **drv** :struct device_driver结构体类型指针
**返回值：**
- **成功：** 0
- **失败：** 负数
***
- 注销驱动
```c
void driver_unregister(struct device_driver *drv);
```

**参数：** **drv** :struct device_drive结构体类型指针
**返回值：** **无**

## 总线、设备、驱动数据结构关系图

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250201154009.png)

## 驱动注册流程

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/20250201154343.png)

系统启动之后会调用buses_init函数创建/sys/bus文件目录，这部分系统在开机时已经帮我们准备好了， 接下去就是通过总线注册函数bus_register进行总线注册，注册完总线后在总线的目录下生成devices文件夹和drivers文件夹， 最后分别通过device_register以及driver_register函数注册相对应的设备和驱动。
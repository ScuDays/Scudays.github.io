---
title: Uboot
date: 2025-01-09 19:49:51
modify: 2025-01-09 19:50:05
author: days
category: Embedded Linux
published: 2025-01-09
draft: true
description: Uboot学习过程
---
## SRAM

SRAM 和 DRAM 的区别：

_OCRAM_:On-chip RAM

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202501092036161.png)

- **OCRAM**：片上 RAM（OCRAM）是 i.MX6ULL 内部的高速静态 RAM，大小为 128 KB。在系统启动初期，OCRAM 用于存储临时数据和代码，直到 DDR 内存初始化完成。
- **ROM**：ROM 中存储了芯片启动时必需的代码和数据，包括 BootStrap 代码、API 向量表和版本信息。
- **内存布局**：ROM 和 RAM 的内存布局是固定的，开发者需要根据这些布局编写代码，确保数据存储和代码执行在正确的地址范围内。

**应用场景**
- **启动流程**：在芯片启动时，ROM 中的 BootStrap 代码首先执行，初始化硬件并加载 U-Boot 或其他引导程序到 OCRAM 中运行。

- **调试与开发**：开发者可以通过 OCRAM 存储调试信息或临时数据，利用 ROM API 和 HAB API 实现高级功能。

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202501092105774.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202501092106012.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202501092108682.png)

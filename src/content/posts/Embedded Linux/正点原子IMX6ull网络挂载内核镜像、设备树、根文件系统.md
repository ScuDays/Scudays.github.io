---
title: 正点原子IMX6ull网络挂载内核镜像、设备树、根文件系统
date: 2025-02-02 19:48:58
modify: 2025-02-02 20:13:46
author: days
category: Embedded Linux
published: 2025-02-02
draft: false
description: 使用网络挂载内核镜像、设备树、根文件系统
---

- ==注意==
正点原子给的教程版本系统镜像有问题，建议使用出厂系统镜像。

# 问题

## NFS版本不支持

[[Linux嵌入式环境配置（全面避坑）#u-boot NFS下载文件报错]] 

# 配置 tftp、nfs，并且挂载镜像、设备树以及根文件系统

参考正点原子教程

## 配置 tftp

![0053.png|493](https://raw.githubusercontent.com/ScuDays/MyImg/master/0053.png)

![0054.png|493](https://raw.githubusercontent.com/ScuDays/MyImg/master/0054.png)

![0055.png|493](https://raw.githubusercontent.com/ScuDays/MyImg/master/0055.png)

![0056.png|493](https://raw.githubusercontent.com/ScuDays/MyImg/master/0056.png)

![0057.png|493](https://raw.githubusercontent.com/ScuDays/MyImg/master/00571.png)

## 配置 nfs

![58.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/58.png)

![59.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/59.png)

![60.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/60.png)

## 网络挂载

![61.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/61.png)

![62.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/62.png)

![63.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/63.png)

![64.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/64.png)

![65.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/65.png)

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

![1.jpg](https://raw.githubusercontent.com/ScuDays/MyImg/master/%E3%80%90%E6%AD%A3%E7%82%B9%E5%8E%9F%E5%AD%90%E3%80%91I.MX6U%E7%BD%91%E7%BB%9C%E7%8E%AF%E5%A2%83TFTP&amp;amp;NFS%E6%90%AD%E5%BB%BA%E6%89%8B%E5%86%8CV1.1_page-0053.jpg)

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/%E3%80%90%E6%AD%A3%E7%82%B9%E5%8E%9F%E5%AD%90%E3%80%91I.MX6U%E7%BD%91%E7%BB%9C%E7%8E%AF%E5%A2%83TFTP&amp;amp;NFS%E6%90%AD%E5%BB%BA%E6%89%8B%E5%86%8CV1.1_page-0054.jpg)

![【正点原子】I.MX6U网络环境TFTP&amp;amp;NFS搭建手册V1.1_page-0055.jpg](https://raw.githubusercontent.com/ScuDays/MyImg/master/%E3%80%90%E6%AD%A3%E7%82%B9%E5%8E%9F%E5%AD%90%E3%80%91I.MX6U%E7%BD%91%E7%BB%9C%E7%8E%AF%E5%A2%83TFTP&amp;amp;NFS%E6%90%AD%E5%BB%BA%E6%89%8B%E5%86%8CV1.1_page-0055.jpg)

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/%E3%80%90%E6%AD%A3%E7%82%B9%E5%8E%9F%E5%AD%90%E3%80%91I.MX6U%E7%BD%91%E7%BB%9C%E7%8E%AF%E5%A2%83TFTP&amp;amp;NFS%E6%90%AD%E5%BB%BA%E6%89%8B%E5%86%8CV1.1_pag056.jpg)

![](https://raw.githubusercontent.com/ScuDays/MyImg/master/%E3%80%90%E6%AD%A3%E7%82%B9%E5%8E%9F%E5%AD%90%E3%80%91I.MX6U%E7%BD%91%E7%BB%9C%E7%8E%AF%E5%A2%83TFTP&amp;amp;NFS%E6%90%AD%E5%BB%BA%E6%89%8B%E5%86%8CV1.1_page-0057.jpg)

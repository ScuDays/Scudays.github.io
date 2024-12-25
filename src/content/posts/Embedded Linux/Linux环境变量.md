---
title: Linux环境变量
date: 2024-12-25 19:27:42
modify: 2024-12-25 19:27:58
author: days
category: Embedded Linux
published: 2024-12-25
draft: false
description: 主要讲解Linux环境变量
---
# linux 环境变量
## Linux 为什么需要环境变量?
## 全局变量 VS 环境变量
### 全局变量

全局变量分为两种

1：直接定义

- 直接定义的全局变量**只能在当前 shell 进程中访问**

- 不能在当前 shell 进程的子进程中访问

2：Export

- Export 导出的全局变量

- 可以在当前 shell 进程中访问

- 也可以在当前 shell 进程的子进程中访问

- **不能在别的 shell 进程中访问**
### 环境变量

可以影响所有的 shell进程

## Shell 配置文件

与 Bash Shell 有关的配置文件主要有

1: **/etc/profile**

- 所有用户第一次登录时执行。
- 用途：系统级别的全局配置，通常用于设置所有用户共享的环境变量和启动程序。

2:*~/. Bash_profile*

- 当前用户第一次登录时执行。
- 用途：用户个人的环境变量和启动脚本。如果该文件存在，Bash 会优先加载它，而不会加载 `~/.bash_login` 或 `~/.profile`。

3:*~/. Bash_login*

- 当前用户第一次登录时执行。
- 用途：如果 `~/.bash_profile` 不存在，Bash 会尝试加载此文件。
- 注意：通常较少使用，优先级低于 `~/.bash_profile`。

4:*~/. Profile* 

- 当前用户第一次登录时执行。
- 用途：如果 `~/.bash_profile` 和 `~/.bash_login` 都不存在，Bash 会加载此文件。通常用于兼容其他 Shell（如 `sh`）。

5:~/. Bashrc 

- 当前用户每次打开新的 Shell 时执行（包括非登录 Shell）。
- 用途：用户个人的别名、函数和 Shell 行为配置。通常会在 `~/.bash_profile` 或 `~/.profile` 中显式加载此文件。

6: */etc/bashrc* 

- 所有用户每次打开新的 Shell 时执行（包括非登录 Shell）。
- 用途：系统级别的全局配置，通常用于设置所有用户的 Shell 行为。
- 注意：在某些发行版中，该文件可能被命名为 `/etc/bash.bashrc`。

7: */etc/bash. Bashrc*

- 所有用户每次打开新的 Shell 时执行（包括非登录 Shell）。
- 用途：与 `/etc/bashrc` 类似，用于系统级别的全局配置。
- 注意：该文件的存在取决于 Linux 发行版，某些发行版可能使用 `/etc/bashrc` 代替。

8: /etc/profile. D/. Sh

- 所有用户第一次登录时执行（由 `/etc/profile` 调用）。
- 用途：存放系统级别的脚本文件，每个脚本文件可以独立配置环境变量或启动程序。
## Shell 执行顺序

/etc/profiles -> ~/. Profile  (~/. Bash_profile、~/. Bash_login)

## 修改配置文件

全部用户、全部进程共享:/etc/bash. Bashrc

一个用户、全部进程共享:~/. Bashrc

## Shell 启动方式对变量的影响

 `test2.sh:`

```shell
export var1=”hello”;
```

脚本一

```shell
Source test2.sh
Echo ${var1}
```

脚本二

```shell
sh test2.sh
Echo ${var1}
```

这两个脚本的运行结果分别为：

脚本 1：hello

脚本 2：

原因：

1. 脚本 2 中调用 `sh test2.sh` 来执行 shell 是开启一个子 shell 环境，**shell 脚本执行完后子 shell 环境随即关闭，子 shell 环境的环境变量被销毁**，所以执行后，结果并没有反应到父 shell 里，

2. 但是 source 不同，是在当前 shell 中执行的，所以能够看到结果为 hello。

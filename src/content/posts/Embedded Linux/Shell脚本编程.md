---
title: Shell脚本编程
date: 2024-12-24 11:44:09
modify: 2024-12-24 11:44:27
author: days
category: Embedded Linux
published: 2024-12-24
draft: false
description: 讲解Shell脚本编程
---
# Shell 脚本编程
## Shell 脚本简介

### Shell 脚本是什么?

- Shell 命令按一定语法组成的可执行文件

### Shell 脚本有什么用?

批处理文件/整合命令

- 软件启动
- 性能监控
- 日志分析

...

### Shell 内置命令/外部命令

可通过 type 命令来查询是内置还是外置命令

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412241155339.png)

#### 内置命令和外置命令的区别

内置命令

-  shell 本身的一部分（大部分由 c 编写），由 shell 直接实现的，直接由 shell 解释和执行，不需要启动新的进程
- **速度快**：由于内部命令直接由 shell 执行，不需要启动新的进程，因此执行速度较快。
- **节省资源**：不需要额外的进程，因此对系统资源的占用较少。

外置命令

- 外部命令是独立的可执行文件，通常位于系统的文件系统中（如 `/bin`、`/usr/bin`、`/usr/sbin` 等目录）。
- 外部命令需要启动一个新的进程来执行。shell 通过 `fork()` 系统调用创建一个子进程执行该命令。
- **速度较慢**：由于需要启动新的进程，外部命令的执行速度通常比内部命令慢。
- **占用资源**：每次系统都会创建一个新的进程，因此会占用更多的系统资源
### Shell 是解释型语言
- 编译型语言：- 源代码在执行前由编译器转化为机器代码（可执行文件），执行时直接运行机器代码，速度较快。例如：C、C++、Go。
- 解释型语言：源代码在运行时由解释器逐行翻译成机器代码并执行，执行速度较慢，但开发过程灵活。例如：Shell、Python、JavaScript、Ruby。

### 常用的 Shell 解释器有哪些?

/etc/shells

### 一个 Shell 脚本创建到运行的流程

Helloworld

编辑、保存

```shell
vim hello.sh
```

改权限、运行/排错

```shell
chmod 777 hello.sh
./hello.sh
```

### Shell 启动方式

- 作为程序执行
- 指定解释器运行
- Source 和.

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412241243161.png)

## Shell 脚本语法讲解

### 定义变量
**定义语法中不能有空格**
- Variable=value  (变量值中不能有空格)
- Variable='value'（变量值中能有空格，所见即所得）
- Variable="value"（变量中可以存在对其他变量的引用）

### 使用变量

- $variable

注意：当后面还要接数据的时候要用{}括起来，不然会把后面的数据认为是变量名的一部分

- ${variable}

### 将命令的结果赋值给变量

- variable=\`command `

- Variable=$(command)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412241336516.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412241336450.png)

### 删除变量
- unset

### 特殊变量

| 变量      | 含义                                                  |
| ------- | --------------------------------------------------- |
| $0      | 当前脚本的文件名。                                           |
| $n（n≥1） | 传递给脚本或函数的参数。N 是一个数字，表示第几个参数。例如，第一个参数是 $1，第二个参数是 $2。 |
| $#      | 传递给脚本或函数的参数个数。                                      |
| $*      | 传递给脚本或函数的所有参数。                                      |
| $@      | 传递给脚本或函数的所有参数。当被双引号 `" "` 包含时，$@ 与 $* 稍有不同.         |
| $?      | 上个命令的退出状态或者获取函数返回值。                                 |
| $$      | 当前 Shell 进程 ID。对于 Shell 脚本，就是这些脚本所在的进程 ID。          |

### 字符串拼接

并排放

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412241417867.png)

### 读取从键盘输入的数据

Read

示例 1：

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412241419945.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412241419588.png)

示例 2：输出提示文字

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412241423887.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412241423610.png)

### 退出当前进程

Exit

### 对整数进行数学运算

(())

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412241445622.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412241445082.png)

### 逻辑与/或

```
command1 && command2
```

```
command1 || command2
```

### 判断条件语句

Test expression 和[ expression ]

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412241558760.png)

解释：如果 inputA 与 inputB 相等，则继续执行后面代码。第三行与第四行等价，一般使用第四行[]这一种方式

| 选项          | 作用                  |
| ----------- | ------------------- |
| -eq         | 判断数值是否相等            |
| -ne         | 判断数值是否不相等           |
| -gt         | 判断数值是否大于            |
| -lt         | 判断数值是否小于            |
| -ge         | 判断数值是否大于等于          |
| -le         | 判断数值是否小于到等于         |
| -z  str     | 判断字符串 str 是否为空      |
| -n  str     | 判断字符串 str 是否为非空     |
| =和==        | 判断字符串 str 是否相等      |
| -d filename | 判断文件是否存在，并且是否为目录文件。 |
| -f filename | 判断文件是否存在，井且是否为普通文件。 |

### 管道

Command 1 | command 2

### If 语句
```shell
if condition
then
	do-something
fi
```

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251600909.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251600303.png)

### If else 语句

```shell
if condition
then
	do-something
else
	do-something
fi
```

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251603068.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251603696.png)

### If elif else 语句
```shell
if  condition1
then
	do-something
elif condition2
then
​    do-something
...
else
	do-something
fi
```

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251606907.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251606004.png)

### Case in 语句
```shell
case expression in
	conditon1)
		do-something
		;;
	conditon2)
		do-something
		;;
	*)
		else do-something
		;;
esac
```

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251622830.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251623376.png)

### For in 循环
```shell
for variable in value_list
do 
	do-something
done
```

Value_list 

- 直接给出具体的值
- 使用一个取值范围
- 使用命令的执行结果
- 使用 Shell 通配符
- 使用特殊变量

直接给出具体的值

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251659233.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251700068.png)

使用一个取值范围

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251700687.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251700785.png)

使用命令的执行结果

和使用 Shell 通配符（\*为通配符）[[Linux通配符]]

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251701261.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251701619.png)

使用特殊变量（上文提到）

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251705696.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251706554.png)

### While 循环
```shell
while conditon
do 
	do-something
done
```

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251714504.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251716310.png)

### 函数
```shell
function function_name(){
	do-something
	[return value]
}
```

无返回值无参数函数

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251738555.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251739215.png)

有返回值有参数函数

- 使用 $1、$2 等特殊变量来获取函数参数
- 使用 $? 获取返回值（注意：多个函数调用返回值会覆盖这个特殊变量）

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251748289.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412251748774.png)

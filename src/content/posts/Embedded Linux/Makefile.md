---
title: Makefile
date: 2024-12-27 19:06:09
modify: 2024-12-27 19:06:09
author: days
category: Embedded Linux
published: 2024-12-27
draft: false
description: Makefile的介绍与使用
---
# Makefile 

## Makefile 简介

### Why we need makefile?
- 为了自动化管理编译和链接过程
![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412281512704.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412281512925.png)

### Make 和 Makefile 是什么关系？

Make 工具: 找出修改过的文件，根据依赖关系，找出受影响的相关文件，最后按照规则单独编译这些文件。

Makefile 文件: 记录依赖关系和编译规则。

## Makefile 使用
### Makefile 三要素

目标、依赖、命令

### 怎样描述三要素的关系
**目标依赖于依赖**
**命令生成目标**
> Target: Dependence  
> \<tab> 命令 1  
> \<tab> 命令 2

一个实例

![image.png|361](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412271955748.png)

### Makefile 执行命令的方式
**Makefile** 最终的执行过程都是通过 **Shell 命令** 来完成的。
**`make`** 本身就是一个工具，它根据 Makefile 中定义的规则和命令来自动化构建过程，而这些规则和命令通常都涉及到执行 Shell 命令。

示例 Makefile：

```makefile
CC = gcc
CFLAGS = -Wall -g

# 目标规则
main: main.o function.o
    $(CC) $(CFLAGS) -o main main.o function.o

main.o: main.c
    $(CC) $(CFLAGS) -c main.c -o main.o

function.o: function.c
    $(CC) $(CFLAGS) -c function.c -o function.o
```

在这个 Makefile 中，`make` 会依次执行以下 **Shell 命令**：

- `gcc -Wall -g -c main.c -o main.o`
- `gcc -Wall -g -c function.c -o function.o`
- `gcc -Wall -g -o main main.o function.o`

**`make` 如何执行这些命令**：
- 当你运行 `make` 命令时，它会读取 Makefile 中的规则，并解析每个规则中的命令。
- 这些命令是由 **Shell 执行的**，`make` 会调用 Shell 来执行每个命令。(取决于系统默认的 shell 工具是什么，或者你可以在 Makefile 中指定使用不同的 shell)
**命令的执行方式**：
- 每条命令都会在一个新的 Shell 进程中执行。这意味着每条命令都是独立的，尽管它们在 Makefile 中是按顺序执行的。
- 如果你在 Makefile 中编写多个命令，它们会在不同的 Shell 实例中执行（除非你使用 `&&` 或其他方式将它们组合成一个命令）。

例如：

```makefile
target:
    command1
    command2
```

这些 `command1` 和 `command2` 会分别在不同的 Shell 进程中执行。

### 伪目标
#### 伪目标作用

Makefile 中大部分目标都是去生成一个特定的文件，大部分情况下我们认为目标≈文件。但有时我们的目标确实是去执行某个特定的指令，例如：clean。这时候就要用到伪目标.

伪目标：**目的不是为了生成目标，仅仅是希望执行其所在规则定义后面的命令**

#### 伪目标的使用
1.声明伪目标（通常在 Makefile 文件开头）：
```makefile
.PHONY: clean (这里声明clean是伪目标)
```
2.定义伪目标规则：
```makefile
clean:		(这里定义伪目标clean的规则,即伪目标的执行动作)
	rm *.c
```

#### 为什么要有伪目标 

为什么不直接用一个目标 target 去对应特定的规则不就好了吗？

比如我不管什么伪目标，我直接这样定义一个 target，执行的效果不是一样的吗？

```makefile
clean:
	rm *.c
```

示例：

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412281616104.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412281617754.png)

我们在这里看，好像确实也执行了同样的功能，那为什么需要伪目标呢？

 

问题就在于假如当前目录下存在一个 clean 文件呢？

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412281618672.png)

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412281618618.png)

当目录下面有一个文件与我们的目标同名且该文件不用被更新的时候，这个目标就不会被执行，所以我们不能正确的执行想要的命令。

所以有了伪目标，无论当前目录下有没有同名文件，都会执行这个伪目标对应的指令。

### 正确使用 Makefile 以提高性能
##### 1. 编译成. o 文件而不是直接编译链接成. out 文件

回顾一下 C 文件的编译过程 [[C 文件的编译过程]]

>  预处理-编译-链接

通常多个. c文件编译后得到. o 文件，再通过链接得到最终的.out 文件

在 makefile 中，当程序由很多源文件得到的时候，最好编译成. o 文件，再进行链接，这样当某个源文件修改的时候，不需要重新编译所有的文件，只需要将修改过的文件编译出. o 文件，然后再进行链接。

这样在大项目中能够显著提高性能。

### 增加 Makefile 通用性

#### 自定义变量定义与使用
##### 自定义变量的定义
- 变量在声明的时候需要声明初值

赋值符号：

- =  延迟定义，等到这个变量被使用的时候，才会定义   
- := 空值定义，只有变量值为空的时候，才会定义
- ?= 立即定义，使用前面定义好的变量,  
- += 追加定义，变量等于本身加上指定的变量  

延迟分配例子：Delay 延迟分配为 Immediate 的值，开始 Immediate 值为 0，但当 Dely 

实际被使用要延迟分配的时候，Immediate 的值为 999，所以 Delay 实际的值是 999.

![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412281930393.png)

##### 变量的引用
- 变量在使用的时候需要在变量名前加上\"\$\"（有点像 shell），最好使用\" \(\)\"或\"\{\}\"包裹变量
> [!NOTE]
> 注意对于变量的引用一定要加上\$, 不然变量名会被认为是一个普通的字符串  

$ 引用和 () 与 {} 的关系，$ 用来引用 变量 或 特殊变量。$() 和 ${} 都是引用变量的

方式，但有一些细微的差异。

- **`$()`**：标准的引用方式。
- **`${}`**：通常用于 **增强的模式替换** 或者 **避免歧义**。
例如：
```makefile
objects = program.o foo.o utils.o
program : $(objects)
	cc -o program $(objects)
$(objects) : defs.h
```

相当于：

```makefile
objects = program.o foo.o utils.o
program : program.o foo.o utils.o
	cc -o program program.o foo.o utils.o
program.o foo.o utils.o : defs.h
```


#### 自动变量

##### \[\$\@\] 代表当前目标
```makefile
target: dependency 
	echo $@	
=
target: dependency 
	echo target
```
##### \[$<] 代表第一个依赖目标
```makefile
output.o: input.c 
	gcc -c $< -o $@
=
output.o: input.c 
	gcc -c input.c -o output.o
```

##### \[\$\?\] 比目标新的依赖目标的集合
```makefile
output.o: input.c header.h 
	gcc -c $? -o $@
```

如果 `input.c` 和 `header.h` 都比 `output.o` 更新了，那么 `$?` 会替换成：

```makefile
output.o: input.c header.h 
	gcc -c input.c header.h -o output.o
```
##### \[\$\^\] 所有依赖的集合, 会去除重复的依赖目标
```makefile
output.o: input.c header.h input.c 
	gcc -c $^ -o $@
```

在这个例子中，`$^` 会被替换成 `input.c header.h`，因为 `input.c` 被列出了两次，但只会显示一次，去除重复。

```makefile
output.o: input.c header.h input.c 
	gcc -c input.c header.h -o output.o0
```
##### \[\$\+\] 所有依赖的集合, 不会去除重复的依赖目标
```makefile
output.o: input.c header.h input.c 
	gcc -c $+ -o $@
=
output.o: input.c header.h input.c
	gcc -c input.c header.h input.c -o output.o
```
##### \[\$\%\] 当目标是函数库文件时, 表示其中的目标文件名

##### \[\$\*\] 这个是GNU make特有的, 其它的make不一定支持
### 隐含规则
#### 自动推导命名

编译C时，\*.o 的目标会自动推导为\*.c

#### 隐含变量

\[RM] rm -f  
\[AR] ar  
\[CC] cc  
\[CXX] g++  
\[ARFLAGS] AR 命令的参数  
\[CFLAGS] 语言编译器的参数  
\[CXXFLAGS] C++语言编译器的参数

### 模式匹配

%: 匹配任意多个非空字符

类似于shell 中的\*通配符

- 匹配的规则

```makefile
%.target : %.source 
	<command>
```

其中 % 是一个通配符，代表任意数量的字符。

比如，要从多个.c文件编译出.o文件，你可以使用如下模式规则：

```makefile
%.o : %.c 
	$(CC) $(CFLAGS) -c $< -o $@
```
- 多模式匹配
```makefile
%.o: %.c %.h 
	$(CC) $(CFLAGS) -c $< -o $@
```

这条规则意味着每个. o 文件不仅取决于对应的. c 文件，还取决于同名的. h 文件。如果. c 或. h 文件发生变化，对应的. o 文件将被重新编译。

### 条件分支

ifeq 判断是否相等

```makefile
ifeq (var1,var2)
  # 如果 var1 和 var2 相等，执行这部分代码
else
  # 如果 var1 和 var2 不相等，执行这部分代码
endif
```

ifneq 判断是否不相等

```
ifneq (var1,var2) 
	# 如果 var1 和 var2 不相等，执行这部分代码 
else 
	# 如果 var1 和 var2 相等，执行这部分代码 
endif
```

这个是 Makefile 内的命令，不是三要素里面的命令

### 常用函数

[Makefile常用的函数 - quinoa - 博客园](https://www.cnblogs.com/053179hu/p/14209672.html)

### 解决头文件依赖
> 我们使用 Makefile 通过 make 进行编译的时候，发现会有一些 warning 产生，这是因为我们在 a.c 文件中使用了 b.c 中的函数，却未 include b.h 同时未告诉 Makefile 头文件的位置在哪里，这就导致了这个问题的发生。
> ![image.png](https://raw.githubusercontent.com/ScuDays/MyImg/master/202412291314254.png)

给 gcc 使用 -I + .h 用来指定**额外的头文件搜索路径**

示例：

假设你有以下文件结构：

```
project/
├── include/
│   └── myheader.h
└── src/
    └── main.c
```

你在 `main.c` 中使用了 `#include "myheader.h"`，而 `myheader.h` 位于 `include` 目录下。

你可以通过以下命令来编译 `main.c`，并告诉编译器去 `include` 目录查找头文件：

示例：

```makefile
main:main.o
	gcc main.o -o main -I ./include
```
  
> 以上就解决了 warning报错  

我们现在已经告诉了 Makefile 我们头文件的位置，解决了 warning 报错，但是当我们更改头文件不 clean 直接进行 make 的时候，虽然头文件已经改变，但是却显示 main 中使用的还是旧的头文件的内容，这是为什么？

这个是因为我们在依赖中没有加入依赖的头文件，所以在多次 make 中不会检测这个头文件是否变化了。

解决：在依赖中添加头文件

```makefile
main:main.o function.h
	gcc main.o -o main -I ./include
```
  

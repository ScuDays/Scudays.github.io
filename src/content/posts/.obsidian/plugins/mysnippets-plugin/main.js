/*
THIS IS A GENERATED/BUNDLED FILE BY ROLLUP
if you want to view the source visit the plugins github repository
*/

'use strict';

var obsidian = require('obsidian');

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function setAttributes(element, attributes) {
    for (let key in attributes) {
        element.setAttribute(key, attributes[key]);
    }
}

class CreateSnippetModal extends obsidian.Modal {
    constructor(app, plugin) {
        super(app);
        this.app = app;
        this.plugin = plugin;
        this.onOpen = () => this.display(true);
    }
    display(focus) {
        return __awaiter(this, void 0, void 0, function* () {
            const { contentEl } = this;
            const customCss = this.app.customCss;
            contentEl.empty();
            contentEl.setAttribute("style", "margin-top: 0px");
            const title = document.createElement("h1");
            title.setText("Create a CSS Snippet");
            contentEl.appendChild(title);
            const fileTitleSetting = new obsidian.Setting(contentEl);
            const fileTitleValue = new obsidian.TextComponent(fileTitleSetting.controlEl);
            fileTitleSetting
                .setName("CSS Snippet Title")
                .setDesc("Write the title for this CSS snippet file.");
            const cssStylesSetting = new obsidian.Setting(contentEl);
            // avoiding having to reference this specific modal - add style in code
            cssStylesSetting.settingEl.setAttribute("style", "display: grid; grid-template-columns: 1fr;");
            const cssStylesValue = new obsidian.TextAreaComponent(cssStylesSetting.controlEl);
            setAttributes(cssStylesValue.inputEl, {
                style: "margin-top: 12px; width: 100%;  height: 32vh;",
                class: "ms-css-editor",
            });
            cssStylesSetting
                .setName("CSS Snippet Styles")
                .setDesc("Add in styling for this CSS snippet file.");
            cssStylesValue.setValue(this.plugin.settings.stylingTemplate);
            const doAdd = () => __awaiter(this, void 0, void 0, function* () {
                let fileName = fileTitleValue.getValue();
                let fileContents = cssStylesValue.getValue();
                let snippetPath = customCss.getSnippetPath(fileName);
                if (fileName) {
                    if (!customCss.snippets.includes(fileName)) {
                        yield app.vault.create(`${customCss.getSnippetsFolder()}/${fileName}.css`, fileContents);
                        console.log(`%c"${fileName}.css" has been created!`, "color: Violet");
                        if (this.plugin.settings.snippetEnabledStatus)
                            customCss.setCssEnabledStatus(fileName, true);
                        if (this.plugin.settings.openSnippetFile)
                            this.app.openWithDefaultApp(snippetPath);
                        customCss.requestLoadSnippets();
                        this.close();
                    }
                    else
                        new obsidian.Notice(`"${fileName}.css" already exists.`);
                }
                else
                    new obsidian.Notice("Missing name for file");
            });
            const saveButton = new obsidian.ButtonComponent(contentEl)
                .setButtonText("Create Snippet")
                .onClick(doAdd);
            saveButton.buttonEl.addClass("wg-button");
            fileTitleValue.inputEl.focus();
        });
    }
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

function snippetsMenu(app, plugin, settings) {
    const windowX = window.innerWidth;
    const windowY = window.innerHeight;
    const menuExists = document.querySelector(".menu.MySnippets-statusbar-menu");
    if (!menuExists) {
        const menu = new obsidian.Menu();
        menu.setUseNativeMenu(false);
        const menuDom = menu.dom;
        menuDom.addClass("MySnippets-statusbar-menu");
        if (settings.aestheticStyle) {
            menuDom.setAttribute("style", "background-color: transparent; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);");
        }
        const customCss = app.customCss;
        const currentSnippets = customCss.snippets;
        const snippetsFolder = customCss.getSnippetsFolder();
        currentSnippets.forEach((snippet) => {
            const snippetPath = customCss.getSnippetPath(snippet);
            menu.addItem((snippetElement) => {
                snippetElement.setTitle(snippet);
                const snippetElementDom = snippetElement.dom;
                const toggleComponent = new obsidian.ToggleComponent(snippetElementDom);
                const buttonComponent = new obsidian.ButtonComponent(snippetElementDom);
                function changeSnippetStatus() {
                    const isEnabled = customCss.enabledSnippets.has(snippet);
                    customCss.setCssEnabledStatus(snippet, !isEnabled);
                }
                toggleComponent
                    .setValue(customCss.enabledSnippets.has(snippet))
                    .onChange(changeSnippetStatus);
                buttonComponent
                    .setIcon("ms-snippet")
                    .setClass("MS-OpenSnippet")
                    .setTooltip(`Open snippet`)
                    .onClick((e) => {
                    app.openWithDefaultApp(snippetPath);
                });
                snippetElement.onClick((e) => {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                });
            });
        });
        menu.addSeparator();
        menu.addItem((actions) => {
            actions.setIcon(null);
            actions.setTitle("Actions");
            const actionsDom = actions.dom;
            setAttributes(actions.titleEl, { style: "font-weight: 700" });
            const reloadButton = new obsidian.ButtonComponent(actionsDom);
            const folderButton = new obsidian.ButtonComponent(actionsDom);
            const addButton = new obsidian.ButtonComponent(actionsDom);
            setAttributes(reloadButton.buttonEl, { style: "margin-right: 3px" });
            setAttributes(addButton.buttonEl, { style: "margin-left: 3px" });
            reloadButton
                .setIcon("ms-reload")
                .setClass("MySnippetsButton")
                .setClass("MS-Reload")
                .setTooltip("Reload snippets")
                .onClick((e) => {
                customCss.requestLoadSnippets();
                new obsidian.Notice("Snippets reloaded");
            });
            folderButton
                .setIcon("ms-folder")
                .setClass("MySnippetsButton")
                .setClass("MS-Folder")
                .setTooltip("Open snippets folder")
                .onClick((e) => {
                app.openWithDefaultApp(snippetsFolder);
            });
            addButton
                .setIcon("ms-add")
                .setClass("MySnippetsButton")
                .setClass("MS-Folder")
                .setTooltip("Create new snippet")
                .onClick((e) => {
                new CreateSnippetModal(app, plugin).open();
            });
        });
        menu.showAtPosition({
            x: windowX - 15,
            y: windowY - 37,
        });
    }
}

const icons = {
    "art-fill": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="0" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14c-.092.064-2 2.083-2 3.5c0 1.494.949 2.448 2 2.5c.906.044 2-.891 2-2.5c0-1.5-1.908-3.436-2-3.5zM9.586 20c.378.378.88.586 1.414.586s1.036-.208 1.414-.586l7-7l-.707-.707L11 4.586L8.707 2.293L7.293 3.707L9.586 6L4 11.586c-.378.378-.586.88-.586 1.414s.208 1.036.586 1.414L9.586 20zM11 7.414L16.586 13H5.414L11 7.414z" fill="currentColor"/></svg>`,
    "art-brush": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="0" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2H7c-1.103 0-2 .897-2 2v3c0 1.103.897 2 2 2h11c1.103 0 2-.897 2-2V4c0-1.103-.897-2-2-2zM7 7V4h11l.002 3H7z" fill="currentColor"/><path d="M13 15v-2c0-1.103-.897-2-2-2H4V5c-1.103 0-2 .897-2 2v4c0 1.103.897 2 2 2h7v2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1z" fill="currentColor"/></svg>`,
    "ms-create-file": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="0" stroke-linecap="round" stroke-linejoin="round"><g class="icon-tabler" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4l-2 14.5l-6 2l-6-2L4 4z"/><path d="M8.5 8h7L11 12h4l-.5 3.5l-2.5.75l-2.5-.75l-.1-.5"/></g></svg>`,
    "pantone-line": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="0" stroke-linecap="round" stroke-linejoin="round"><path d="M5.764 8l-.295-.73a1 1 0 0 1 .553-1.302l9.272-3.746a1 1 0 0 1 1.301.552l5.62 13.908a1 1 0 0 1-.553 1.302L12.39 21.73a1 1 0 0 1-1.302-.553L11 20.96V21H7a1 1 0 0 1-1-1v-.27l-3.35-1.353a1 1 0 0 1-.552-1.302L5.764 8zM8 19h2.209L8 13.533V19zm-2-6.244l-1.673 4.141L6 17.608v-4.852zm1.698-5.309l4.87 12.054l7.418-2.997l-4.87-12.053l-7.418 2.996zm2.978 2.033a1 1 0 1 1-.749-1.855a1 1 0 0 1 .75 1.855z" fill="currentColor"/></svg>`,
    "ms-code": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="0" stroke-linecap="round" stroke-linejoin="round"><g fill="none"><path d="M20 21H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2zM4 7v12h16V7H4zm10.707 9.707l-1.413-1.413L15.586 13l-2.293-2.293l1.414-1.414L18.414 13l-3.706 3.706l-.001.001zm-5.414 0L5.586 13l3.707-3.707l1.414 1.414L8.414 13l2.292 2.293l-1.413 1.413v.001z" fill="currentColor"/></g></svg>`,
    "ms-reload": `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><path d="M6 4h15a1 1 0 0 1 1 1v7h-2V6H6v3L1 5l5-4v3zm12 16H3a1 1 0 0 1-1-1v-7h2v6h14v-3l5 4l-5 4v-3z" fill="white"/></svg>`,
    "ms-folder": `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><path fill="white" d="M20 5h-8.586L9.707 3.293A.997.997 0 0 0 9 3H4c-1.103 0-2 .897-2 2v14c0 1.103.897 2 2 2h16c1.103 0 2-.897 2-2V7c0-1.103-.897-2-2-2zM4 19V7h16l.002 12H4z"></path></svg>`,
    "ms-snippet": `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><path d="M7.375 16.781l1.25-1.562L4.601 12l4.024-3.219l-1.25-1.562l-5 4a1 1 0 0 0 0 1.562l5 4zm9.25-9.562l-1.25 1.562L19.399 12l-4.024 3.219l1.25 1.562l5-4a1 1 0 0 0 0-1.562l-5-4zm-1.649-4.003l-4 18l-1.953-.434l4-18z" fill="white"/></svg>`,
    "ms-add": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="white" stroke-width="0" stroke-linecap="round" stroke-linejoin="round"><path d="M13 7h-2v4H7v2h4v4h2v-4h4v-2h-4z" fill="white"/><path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10s10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8s8 3.589 8 8s-3.589 8-8 8z" fill="white"/></svg>`,
    "ms-save": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="white" stroke-width="0" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21h14a2 2 0 0 0 2-2V8a1 1 0 0 0-.29-.71l-4-4A1 1 0 0 0 16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2zm10-2H9v-5h6zM13 7h-2V5h2zM5 5h2v4h8V5h.59L19 8.41V19h-2v-5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5H5z" fill="white"/></svg>`,
    "ms-delete": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="white" stroke-width="0" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8h2V6h-4V4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H3v2h2zM9 4h6v2H9zM8 8h9v12H7V8z" fill="white"/><path d="M9 10h2v8H9zm4 0h2v8h-2z" fill="white"/></svg>`,
    "ms-css-file": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="0" stroke-linecap="round" stroke-linejoin="round"><path d="M 6 2 C 4.895 2 4 2.895 4 4 L 4 9 L 3 9 C 1.895 9 1 9.895 1 11 L 1 16 C 1 17.105 1.895 18 3 18 L 4 18 L 4 20 C 4 21.105 4.895 22 6 22 L 18 22 C 19.105 22 20 21.105 20 20 L 20 7.828125 C 20 7.298125 19.789062 6.7890625 19.414062 6.4140625 L 15.585938 2.5859375 C 15.210937 2.2109375 14.701875 2 14.171875 2 L 6 2 z M 6 4 L 14 4 L 14 7 C 14 7.552 14.448 8 15 8 L 18 8 L 18 20 L 6 20 L 6 18 L 15 18 C 16.105 18 17 17.105 17 16 L 17 11 C 17 9.895 16.105 9 15 9 L 6 9 L 6 4 z M 5 11 C 6.105 11 7 11.895 7 13 L 6 13 C 6 12.449 5.551 12 5 12 C 4.449 12 4 12.449 4 13 L 4 14 C 4 14.551 4.449 15 5 15 C 5.551 15 6 14.551 6 14 L 7 14 C 7 15.105 6.105 16 5 16 C 3.895 16 3 15.105 3 14 L 3 13 C 3 11.895 3.895 11 5 11 z M 9.6445312 11.001953 C 11.067531 11.042953 11.154297 12.284859 11.154297 12.505859 L 10.1875 12.505859 C 10.1875 12.402859 10.204906 11.806641 9.6289062 11.806641 C 9.4539062 11.806641 9.0598438 11.884187 9.0898438 12.367188 C 9.1188437 12.808188 9.7035469 13.018406 9.8105469 13.066406 C 10.034547 13.148406 11.141391 13.642391 11.150391 14.650391 C 11.152391 14.864391 11.097062 15.985 9.6640625 16 C 8.1050625 16.017 8 14.675438 8 14.398438 L 8.9746094 14.398438 C 8.9746094 14.545438 8.9870625 15.256172 9.6640625 15.201172 C 10.071063 15.167172 10.159828 14.87425 10.173828 14.65625 C 10.195828 14.29025 9.8465625 14.070578 9.4765625 13.892578 C 8.9565625 13.642578 8.1341406 13.335328 8.1191406 12.361328 C 8.1061406 11.484328 8.7505312 10.976953 9.6445312 11.001953 z M 13.490234 11.001953 C 14.913234 11.042953 15 12.284859 15 12.505859 L 14.03125 12.505859 C 14.03125 12.402859 14.048656 11.806641 13.472656 11.806641 C 13.297656 11.806641 12.905547 11.884187 12.935547 12.367188 C 12.964547 12.808188 13.547297 13.018406 13.654297 13.066406 C 13.878297 13.148406 14.987094 13.642391 14.996094 14.650391 C 14.998094 14.864391 14.942766 15.985 13.509766 16 C 11.950766 16.017 11.845703 14.675437 11.845703 14.398438 L 12.820312 14.398438 C 12.820312 14.545438 12.832766 15.256172 13.509766 15.201172 C 13.916766 15.167172 14.005531 14.87425 14.019531 14.65625 C 14.041531 14.29025 13.692266 14.070578 13.322266 13.892578 C 12.802266 13.642578 11.979844 13.335328 11.964844 12.361328 C 11.951844 11.484328 12.596234 10.976953 13.490234 11.001953 z" fill="currentColor"/></svg>`,
};
function addIcons() {
    Object.keys(icons).forEach((key) => {
        obsidian.addIcon(key, icons[key]);
    });
}

class MySnippetsSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h1", { text: "MySnippets" });
        containerEl.createEl("p", { text: "Created by " }).createEl("a", {
            text: "Chetachi 👩🏽‍💻",
            href: "https://github.com/chetachiezikeuzor",
        });
        containerEl.createEl("h2", { text: "Plugin Settings" });
        new obsidian.Setting(containerEl)
            .setName("Glass menu effect")
            .setDesc("Choose to change the background from the secondary background color of your theme to a glass background.")
            .addToggle((toggle) => {
            toggle
                .setValue(this.plugin.settings.aestheticStyle)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.aestheticStyle = value;
                this.plugin.saveSettings();
            }));
        });
        new obsidian.Setting(containerEl)
            .setName("Auto open new snippet")
            .setDesc("Choose whether or not to open CSS snippet files immeditaley after creating them. It will open in your default app.")
            .addToggle((toggle) => {
            toggle
                .setValue(this.plugin.settings.openSnippetFile)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.openSnippetFile = value;
                this.plugin.saveSettings();
            }));
        });
        new obsidian.Setting(containerEl)
            .setName("Set new snippet status")
            .setDesc("Choose whether or not to have newly created CSS snippet files toggled on automatically upon creation.")
            .addToggle((toggle) => {
            toggle
                .setValue(this.plugin.settings.snippetEnabledStatus)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.snippetEnabledStatus = value;
                this.plugin.saveSettings();
            }));
        });
        const stylingTemplateSetting = new obsidian.Setting(containerEl);
        stylingTemplateSetting.settingEl.setAttribute("style", "display: grid; grid-template-columns: 1fr;");
        stylingTemplateSetting
            .setName("CSS snippet template")
            .setDesc("Set default CSS styling as a template for new CSS files you choose to create.");
        const stylingTemplateContent = new obsidian.TextAreaComponent(stylingTemplateSetting.controlEl);
        setAttributes(stylingTemplateContent.inputEl, {
            style: "margin-top: 12px; width: 100%;  height: 32vh;",
            class: "ms-css-editor",
        });
        stylingTemplateContent
            .setValue(this.plugin.settings.stylingTemplate)
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.stylingTemplate = value;
            this.plugin.saveSettings();
        }));
        const msDonationDiv = containerEl.createEl("div", {
            cls: "msDonationSection",
        });
        const donateText = createEl("p");
        donateText.appendText("If you like this Plugin and are considering donating to support continued development, use the buttons below!");
        msDonationDiv.appendChild(donateText);
        msDonationDiv.appendChild(paypalButton("https://paypal.me/chelseaezikeuzor"));
        msDonationDiv.appendChild(buyMeACoffeeButton("https://www.buymeacoffee.com/chetachi"));
        msDonationDiv.appendChild(kofiButton("https://ko-fi.com/chetachi"));
    }
}
const buyMeACoffeeButton = (link) => {
    const a = createEl("a");
    a.setAttribute("href", link);
    a.addClass("buymeacoffee-chetachi-img");
    a.innerHTML = `<img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=chetachi&button_colour=e3e7ef&font_colour=262626&font_family=Poppins&outline_colour=262626&coffee_colour=ff0000" height="42px"> `;
    return a;
};
const paypalButton = (link) => {
    const a = createEl("a");
    a.setAttribute("href", link);
    a.addClass("buymeacoffee-chetachi-img");
    a.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="40">
  <path fill="#253B80" d="M46.211 6.749h-6.839a.95.95 0 0 0-.939.802l-2.766 17.537a.57.57 0 0 0 .564.658h3.265a.95.95 0 0 0 .939-.803l.746-4.73a.95.95 0 0 1 .938-.803h2.165c4.505 0 7.105-2.18 7.784-6.5.306-1.89.013-3.375-.872-4.415-.972-1.142-2.696-1.746-4.985-1.746zM47 13.154c-.374 2.454-2.249 2.454-4.062 2.454h-1.032l.724-4.583a.57.57 0 0 1 .563-.481h.473c1.235 0 2.4 0 3.002.704.359.42.469 1.044.332 1.906zM66.654 13.075h-3.275a.57.57 0 0 0-.563.481l-.145.916-.229-.332c-.709-1.029-2.29-1.373-3.868-1.373-3.619 0-6.71 2.741-7.312 6.586-.313 1.918.132 3.752 1.22 5.031.998 1.176 2.426 1.666 4.125 1.666 2.916 0 4.533-1.875 4.533-1.875l-.146.91a.57.57 0 0 0 .562.66h2.95a.95.95 0 0 0 .939-.803l1.77-11.209a.568.568 0 0 0-.561-.658zm-4.565 6.374c-.316 1.871-1.801 3.127-3.695 3.127-.951 0-1.711-.305-2.199-.883-.484-.574-.668-1.391-.514-2.301.295-1.855 1.805-3.152 3.67-3.152.93 0 1.686.309 2.184.892.499.589.697 1.411.554 2.317zM84.096 13.075h-3.291a.954.954 0 0 0-.787.417l-4.539 6.686-1.924-6.425a.953.953 0 0 0-.912-.678h-3.234a.57.57 0 0 0-.541.754l3.625 10.638-3.408 4.811a.57.57 0 0 0 .465.9h3.287a.949.949 0 0 0 .781-.408l10.946-15.8a.57.57 0 0 0-.468-.895z"></path>
  <path fill="#179BD7" d="M94.992 6.749h-6.84a.95.95 0 0 0-.938.802l-2.766 17.537a.569.569 0 0 0 .562.658h3.51a.665.665 0 0 0 .656-.562l.785-4.971a.95.95 0 0 1 .938-.803h2.164c4.506 0 7.105-2.18 7.785-6.5.307-1.89.012-3.375-.873-4.415-.971-1.142-2.694-1.746-4.983-1.746zm.789 6.405c-.373 2.454-2.248 2.454-4.062 2.454h-1.031l.725-4.583a.568.568 0 0 1 .562-.481h.473c1.234 0 2.4 0 3.002.704.359.42.468 1.044.331 1.906zM115.434 13.075h-3.273a.567.567 0 0 0-.562.481l-.145.916-.23-.332c-.709-1.029-2.289-1.373-3.867-1.373-3.619 0-6.709 2.741-7.311 6.586-.312 1.918.131 3.752 1.219 5.031 1 1.176 2.426 1.666 4.125 1.666 2.916 0 4.533-1.875 4.533-1.875l-.146.91a.57.57 0 0 0 .564.66h2.949a.95.95 0 0 0 .938-.803l1.771-11.209a.571.571 0 0 0-.565-.658zm-4.565 6.374c-.314 1.871-1.801 3.127-3.695 3.127-.949 0-1.711-.305-2.199-.883-.484-.574-.666-1.391-.514-2.301.297-1.855 1.805-3.152 3.67-3.152.93 0 1.686.309 2.184.892.501.589.699 1.411.554 2.317zM119.295 7.23l-2.807 17.858a.569.569 0 0 0 .562.658h2.822c.469 0 .867-.34.939-.803l2.768-17.536a.57.57 0 0 0-.562-.659h-3.16a.571.571 0 0 0-.562.482z"></path>
  <path fill="#253B80" d="M7.266 29.154l.523-3.322-1.165-.027H1.061L4.927 1.292a.316.316 0 0 1 .314-.268h9.38c3.114 0 5.263.648 6.385 1.927.526.6.861 1.227 1.023 1.917.17.724.173 1.589.007 2.644l-.012.077v.676l.526.298a3.69 3.69 0 0 1 1.065.812c.45.513.741 1.165.864 1.938.127.795.085 1.741-.123 2.812-.24 1.232-.628 2.305-1.152 3.183a6.547 6.547 0 0 1-1.825 2c-.696.494-1.523.869-2.458 1.109-.906.236-1.939.355-3.072.355h-.73c-.522 0-1.029.188-1.427.525a2.21 2.21 0 0 0-.744 1.328l-.055.299-.924 5.855-.042.215c-.011.068-.03.102-.058.125a.155.155 0 0 1-.096.035H7.266z"></path>
  <path fill="#179BD7" d="M23.048 7.667c-.028.179-.06.362-.096.55-1.237 6.351-5.469 8.545-10.874 8.545H9.326c-.661 0-1.218.48-1.321 1.132L6.596 26.83l-.399 2.533a.704.704 0 0 0 .695.814h4.881c.578 0 1.069-.42 1.16-.99l.048-.248.919-5.832.059-.32c.09-.572.582-.992 1.16-.992h.73c4.729 0 8.431-1.92 9.513-7.476.452-2.321.218-4.259-.978-5.622a4.667 4.667 0 0 0-1.336-1.03z"></path>
  <path fill="#222D65" d="M21.754 7.151a9.757 9.757 0 0 0-1.203-.267 15.284 15.284 0 0 0-2.426-.177h-7.352a1.172 1.172 0 0 0-1.159.992L8.05 17.605l-.045.289a1.336 1.336 0 0 1 1.321-1.132h2.752c5.405 0 9.637-2.195 10.874-8.545.037-.188.068-.371.096-.55a6.594 6.594 0 0 0-1.017-.429 9.045 9.045 0 0 0-.277-.087z"></path>
  <path fill="#253B80" d="M9.614 7.699a1.169 1.169 0 0 1 1.159-.991h7.352c.871 0 1.684.057 2.426.177a9.757 9.757 0 0 1 1.481.353c.365.121.704.264 1.017.429.368-2.347-.003-3.945-1.272-5.392C20.378.682 17.853 0 14.622 0h-9.38c-.66 0-1.223.48-1.325 1.133L.01 25.898a.806.806 0 0 0 .795.932h5.791l1.454-9.225 1.564-9.906z"></path>
  </svg>`;
    return a;
};
const kofiButton = (link) => {
    const a = createEl("a");
    a.setAttribute("href", link);
    a.addClass("buymeacoffee-chetachi-img");
    a.innerHTML = `<img src="https://raw.githubusercontent.com/chetachiezikeuzor/MySnippets-Plugin/master/assets/kofi_color.svg" height="50">`;
    return a;
};

const DEFAULT_SETTINGS = {
    aestheticStyle: false,
    snippetViewPosition: "left",
    openSnippetFile: true,
    stylingTemplate: "",
    snippetEnabledStatus: false,
};

class MySnippetsPlugin extends obsidian.Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`MySnippets v${this.manifest.version} loaded`);
            addIcons();
            yield this.loadSettings();
            this.addSettingTab(new MySnippetsSettingTab(this.app, this));
            this.app.workspace.onLayoutReady(() => {
                setTimeout(() => {
                    this.setupSnippetsStatusBarIcon();
                });
            });
        });
    }
    setupSnippetsStatusBarIcon() {
        this.statusBarIcon = this.addStatusBarItem();
        this.statusBarIcon.addClass("MiniSettings-statusbar-button");
        this.statusBarIcon.addClass("mod-clickable");
        setAttributes(this.statusBarIcon, {
            "aria-label": "Configure Snippets",
            "aria-label-position": "top",
        });
        obsidian.setIcon(this.statusBarIcon, "pantone-line");
        this.statusBarIcon.addEventListener("click", () => {
            snippetsMenu(this.app, this, this.settings);
        });
        this.addCommand({
            id: `open-snippets-menu`,
            name: `Open snippets in status bar`,
            icon: `pantone-line`,
            callback: () => __awaiter(this, void 0, void 0, function* () {
                snippetsMenu(this.app, this, this.settings);
            }),
        });
        this.addCommand({
            id: `open-snippets-create`,
            name: `Create new CSS snippet`,
            icon: `ms-css-file`,
            callback: () => __awaiter(this, void 0, void 0, function* () {
                new CreateSnippetModal(this.app, this).open();
            }),
        });
    }
    onunload() {
        console.log("MySnippets unloaded");
    }
    loadSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
        });
    }
    saveSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveData(this.settings);
        });
    }
}

module.exports = MySnippetsPlugin;


/* nosourcemap */
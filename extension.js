/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import {Extension} from "resource:///org/gnome/shell/extensions/extension.js";

//cosnt _ = Extension.gettext;

import St from "gi://St";
import Gio from "gi://Gio";
import GObject from "gi://GObject";

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

import * as Main from "resource:///org/gnome/shell/ui/main.js";
//const QuickSettingsMenu = Main.panel.statusArea.quickSettings;

const LOG_PREFIX = "Scenery extension [scenery@benjamman.github.io]";
const DEBUG = true;

function log() {
    if (DEBUG) console.log([LOG_PREFIX, ...arguments].join(" "));
}

class SceneryScene {
    constructor(id, title, extensionObject) {
        this.id = id;
        this.title = title;
        this.gicon = Gio.icon_new_for_string(`${extensionObject.path}/scenes/icons/${this.id}.svg`);
    }
}

const SceneryQuickMenu = GObject.registerClass(
class SceneryQuickMenu extends QuickSettings.QuickMenuToggle {
    _init(extensionObject) {
        log("SceneryQuickMenu initializing.");

        super._init({
            title: _('Scenery'),
            subtitle: extensionObject._scenes[extensionObject._scene].title,
            gicon: extensionObject._scenes[extensionObject._scene].gicon,
            toggleMode: true,
        });

        this.connect("clicked", () => {
            // Change _on to reflect whether the toggle is on
            extensionObject._on = this.checked;
            extensionObject._indicator.visible = this.checked;

            // If off, change to the default scene
            if (!this.checked) {
                extensionObject._changeScenery(0, {
                    overrideCheck: true,
                    noIndicatorUpdate: true
                });
                return;
            }
            
            // Otherwise update scenery
            extensionObject._changeScenery(extensionObject._lastScene, {
                overrideCheck: true
            });
        });

        //this._settings = new Gio.Settings({
            //schema_id: 'org.gnome.shell.extensions.scenery-benjamman',
        //});
        //this._settings.bind('scenery-on',
            //this, 'checked',
            //Gio.SettingsBindFlags.DEFAULT);

        // Add a header with an icon, title and optional subtitle. This is
        // recommended for consistency with other quick settings menus.
        this.menu.setHeader(extensionObject.icons.changeScenery, _('Change Scenery'),
            _('Pick a scene from the list below'));

        // Add suffix to the header, to the right of the title.
        //const headerSuffix = new St.Icon({
        //    iconName: 'dialog-warning-symbolic',
        //});
        //this.menu.addHeaderSuffix(headerSuffix);

        // Add a section of items to the menu
        this._itemsSection = new PopupMenu.PopupMenuSection();

        // Make an action for each scene exluding the default scene
        for (let i = 1; i < extensionObject._scenes.length; i++) {
            const scene = extensionObject._scenes[i];
            this._itemsSection.addAction(_(scene.title),
                () => {
                    extensionObject._indicator.visible = extensionObject._on = this.checked = true;
                    extensionObject._changeScenery(scene);
                });
        }
        this.menu.addMenuItem(this._itemsSection);

        // Add an entry-point for more settings
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const settingsItem = this.menu.addAction('More Settings',
            () => extensionObject.openPreferences());

        // Ensure the settings are unavailable when the screen is locked
        settingsItem.visible = Main.sessionMode.allowSettings;
        this.menu._settingsActions[extensionObject.uuid] = settingsItem;
    }
});

const SceneryIndicator = GObject.registerClass(
class SceneryIndicator extends QuickSettings.SystemIndicator {
    _init(extensionObject) {
        log("SceneryIndicator initializing.");

        super._init();

        // Create an icon for the indicator
        this._indicator = this._addIndicator();
        //this._indicator.icon_name = 'selection-mode-symbolic';

        // Showing an indicator when the feature is enabled
        //this._settings = extensionObject.getSettings();
        //this._settings.bind('feature-enabled',
            //this._indicator, 'visible',
            //Gio.SettingsBindFlags.DEFAULT);

        // QuickSettings
        this._sceneryQuickMenu = new SceneryQuickMenu(extensionObject);
        this.quickSettingsItems.push(this._sceneryQuickMenu);
    }

    _onSceneChange(scene) {
        this._indicator.gicon = scene.gicon;
        this._sceneryQuickMenu.gicon = scene.gicon;
        this._sceneryQuickMenu.subtitle = scene.title;
    }

    destroy() {
        this.quickSettingsItems.forEach(item => item.destroy());
        super.destroy();
    }
});


export default class SceneryExtension extends Extension {
    _changeTopbarColor() {
        log("changing topbar color.");
        Main.panel.remove_style_class_name('panel--scene-' + this._scenes[this._lastScene].id);
        Main.panel.add_style_class_name('panel--scene-' + this._scenes[this._scene].id);
    }

    _changeWallpaper() {
        log("changing desktop background.");
        const background = new Gio.Settings({schema: "org.gnome.desktop.background"}),
                path = "file://" + (this._scenes[this._scene].wallpaper || this.path + '/scenes/wallpapers/' + this._scenes[this._scene].id + ".png");

        let set_prop = (prop) => {
            if (background.is_writable(prop)) {
                if (!background.set_string(prop, path)) {
                    log(`Failed to write property ${prop}`);
                }
            } else {
                log(`Property not writable ${prop}`)
            }
        }

        const keys = background.list_keys();

        let set_picture_uri = (prop = "picture-uri") => { if (keys.indexOf(prop) !== -1) set_prop(prop) }

        set_picture_uri()
        set_picture_uri('picture-uri-dark')
    }

    _changeScenery(scene, opt = {}) {
        // For when a SceneryScene object gets passed instead of an int, so it still works
        if (typeof scene == "object") scene = this._scenes.indexOf(scene);
        
        // Update what scene is selected
        this._lastScene = this._scene;
        this._scene = scene ?? this._scene;
        
        // Update the indicator
        if (!opt.noIndicatorUpdate) {
            this._indicator._onSceneChange(this._scenes[this._scene]);
        }

        // Change the scenery, if conditions are met
        if (opt.overrideCheck || (this._on && this._scene != this._lastScene)) {
            log("changing scene from", this._lastScene, "to", this._scene, ".");
            this._changeTopbarColor();
            this._changeWallpaper();
            return;
        }

        // Ensure that the correct scene is loaded when toggled back from default
        this._lastScene = this._scene;
    }

    enable() {
        log("enabling.");

        // Status variables
        this._on = false;
        this._scene = 1;
        this._lastScene = 1;

        // Scenes, will be loaded instead of hard-coded later
        this._scenes = [
            new SceneryScene("default", _("Default"), this),
            new SceneryScene("work", "Work", this),
            new SceneryScene("game", "Game", this)
        ];

        // Icons
        this.icons = {
            changeScenery: Gio.icon_new_for_string(`${this.path}/icons/change-scenery.svg`),
            unknown: Gio.icon_new_for_string(`${this.path}/scenes/icons/unknown.svg`)
        };

        // Indicator, handles the quick settings items
        this._indicator = new SceneryIndicator(this);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
        this._indicator.visible = this._on;

        // Lastly update the scene to make sure everything is correct on restart
        this._changeScenery(this._on ? this._scene : 0, { overrideCheck: true, noIndicatorUpdate: !this._on /* Don't show indicator for default */ });
    }

    disable() {
        log("disabling.");
        this._indicator.destroy();
        this._indicator = null;
        this._changeScenery(0, { noIndicatorUpdate: true, overrideCheck: true });
    }
}

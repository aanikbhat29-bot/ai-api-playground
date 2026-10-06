import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

const BUS_NAME = "org.jarvis.Desktop";
const OBJECT_PATH = "/org/jarvis/Desktop";

const INTERFACE_XML = `
<node>
  <interface name="org.jarvis.Desktop">
    <method name="Status"><arg type="b" direction="out"/><arg type="s" direction="out"/></method>
    <method name="TypeText"><arg type="s" direction="in"/><arg type="b" direction="out"/><arg type="s" direction="out"/></method>
    <method name="PressKey"><arg type="s" direction="in"/><arg type="b" direction="out"/><arg type="s" direction="out"/></method>
    <method name="PressCombo"><arg type="s" direction="in"/><arg type="b" direction="out"/><arg type="s" direction="out"/></method>
    <method name="MovePointer"><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="b" direction="out"/><arg type="s" direction="out"/></method>
    <method name="Click"><arg type="u" direction="in"/><arg type="u" direction="in"/><arg type="b" direction="out"/><arg type="s" direction="out"/></method>
    <method name="Scroll"><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="b" direction="out"/><arg type="s" direction="out"/></method>
    <method name="Drag"><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="u" direction="in"/><arg type="b" direction="out"/><arg type="s" direction="out"/></method>
    <method name="ListWindows"><arg type="s" direction="out"/></method>
    <method name="WindowControl"><arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="b" direction="out"/><arg type="s" direction="out"/></method>
  </interface>
</node>`;

const MODIFIER_KEYS = {
  ctrl: "Control_L",
  control: "Control_L",
  shift: "Shift_L",
  alt: "Alt_L",
  super: "Super_L",
  win: "Super_L",
  meta: "Super_L",
};

function now() {
  return GLib.get_monotonic_time();
}

function result(callback) {
  try {
    callback();
    return [true, ""];
  } catch (error) {
    return [false, error instanceof Error ? error.message : String(error)];
  }
}

export default class JarvisDesktopControlExtension extends Extension {
  enable() {
    const seat = Clutter.get_default_backend().get_default_seat();
    this._keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    this._pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    this._dbusObject = Gio.DBusExportedObject.wrapJSObject(INTERFACE_XML, this);
    this._dbusObject.export(Gio.DBus.session, OBJECT_PATH);
    this._ownerId = Gio.bus_own_name_on_connection(
      Gio.DBus.session,
      BUS_NAME,
      Gio.BusNameOwnerFlags.NONE,
      null,
      null,
    );
  }

  disable() {
    if (this._ownerId) Gio.bus_unown_name(this._ownerId);
    this._ownerId = 0;
    this._dbusObject?.unexport();
    this._dbusObject = null;
    this._keyboard = null;
    this._pointer = null;
  }

  Status() {
    return [true, JSON.stringify({ session: "gnome-wayland", input: true, stage: [global.stage.width, global.stage.height] })];
  }

  _keyval(value) {
    const name = String(value || "").trim();
    if (!name) throw new Error("Key is required.");
    const keyval = Clutter.keyval_from_name(name) || (name.length === 1 ? Clutter.unicode_to_keysym(name.codePointAt(0)) : 0);
    if (!keyval) throw new Error(`Unknown key '${name}'.`);
    return keyval;
  }

  _pressKey(value) {
    const keyval = this._keyval(value);
    this._keyboard.notify_keyval(now(), keyval, Clutter.KeyState.PRESSED);
    this._keyboard.notify_keyval(now(), keyval, Clutter.KeyState.RELEASED);
  }

  TypeText(text) {
    return result(() => {
      for (const character of String(text || "")) {
        if (character === "\n") this._pressKey("Return");
        else if (character === "\t") this._pressKey("Tab");
        else this._pressKey(character);
      }
    });
  }

  PressKey(key) {
    return result(() => this._pressKey(key));
  }

  PressCombo(combo) {
    return result(() => {
      const parts = String(combo || "").split("+").map((part) => part.trim()).filter(Boolean);
      if (!parts.length) throw new Error("Key combination is required.");
      const target = parts.pop();
      const modifiers = parts.map((part) => MODIFIER_KEYS[part.toLowerCase()] || part);

      for (const modifier of modifiers) {
        this._keyboard.notify_keyval(now(), this._keyval(modifier), Clutter.KeyState.PRESSED);
      }
      this._pressKey(target);
      for (const modifier of modifiers.reverse()) {
        this._keyboard.notify_keyval(now(), this._keyval(modifier), Clutter.KeyState.RELEASED);
      }
    });
  }

  MovePointer(x, y) {
    return result(() => this._pointer.notify_absolute_motion(now(), Number(x), Number(y)));
  }

  Click(button, count) {
    return result(() => {
      for (let index = 0; index < Number(count); index += 1) {
        this._pointer.notify_button(now(), Number(button), Clutter.ButtonState.PRESSED);
        this._pointer.notify_button(now(), Number(button), Clutter.ButtonState.RELEASED);
      }
    });
  }

  Scroll(deltaX, deltaY) {
    return result(() => this._pointer.notify_scroll_continuous(
      now(),
      Number(deltaX),
      Number(deltaY),
      Clutter.ScrollSource.WHEEL,
      Clutter.ScrollFinishFlags.NONE,
    ));
  }

  Drag(x, y, toX, toY, button) {
    return result(() => {
      this._pointer.notify_absolute_motion(now(), Number(x), Number(y));
      this._pointer.notify_button(now(), Number(button), Clutter.ButtonState.PRESSED);
      this._pointer.notify_absolute_motion(now(), Number(toX), Number(toY));
      this._pointer.notify_button(now(), Number(button), Clutter.ButtonState.RELEASED);
    });
  }

  _windows() {
    return global.display.list_all_windows().filter((window) => !window.skip_taskbar);
  }

  ListWindows() {
    const windows = this._windows().map((window) => ({
      id: String(window.get_stable_sequence()),
      title: window.get_title() || "",
      app: window.get_wm_class() || "",
      minimized: window.minimized,
      maximized: window.maximized_horizontally && window.maximized_vertically,
    }));
    return [JSON.stringify(windows)];
  }

  WindowControl(action, windowId, x, y, width, height) {
    return result(() => {
      const window = this._windows().find((candidate) => String(candidate.get_stable_sequence()) === String(windowId));
      if (!window) throw new Error("Window was not found. Refresh the window list before trying again.");
      const time = global.get_current_time();
      switch (String(action)) {
        case "focus": window.activate(time); break;
        case "minimize": window.minimize(); break;
        case "maximize": window.maximize(3); break;
        case "restore": window.unmaximize(3); break;
        case "close": window.delete(time); break;
        case "move": window.move_resize_frame(false, Number(x), Number(y), 0, 0); break;
        case "resize": window.move_resize_frame(false, 0, 0, Number(width), Number(height)); break;
        case "move_resize": window.move_resize_frame(false, Number(x), Number(y), Number(width), Number(height)); break;
        default: throw new Error("Unsupported window action.");
      }
    });
  }
}

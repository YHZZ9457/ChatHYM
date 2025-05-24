import os
import tkinter as tk
from tkinter import ttk, messagebox, font as tkfont
import platform

# --- 全局常量 ---
import sys
import os

if getattr(sys, 'frozen', False):
    # 被 PyInstaller 打包成 exe 之后
    PROJECT_DIR = os.path.dirname(sys.executable)
else:
    # 直接运行 py 脚本时
    PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(PROJECT_DIR, ".env")
START_BAT_NAME = "start.bat" # 或者你的 .sh 脚本名
START_BAT_PATH = os.path.join(PROJECT_DIR, START_BAT_NAME)

# --- 尝试导入 ttkthemes ---
try:
    from ttkthemes import ThemedTk
    TTK_THEMES_AVAILABLE = True
except ImportError:
    TTK_THEMES_AVAILABLE = False

# --- 全局变量 ---
providers_config = {}
entry_widgets_map = {}
selected_provider_var = None
root = None # 主窗口，稍后初始化
app_style = None # AppStyle 实例
api_key_input_area_container = None # 用于动态显示输入框的容器


# --- DPI 缩放逻辑 ---
def get_dpi_scale_factor(window_for_dpi):
    try:
        # 尝试使用 Tkinter 的内置方法 (Python 3.10+ on Windows)
        if hasattr(window_for_dpi, 'tk') and hasattr(window_for_dpi.tk, 'call'):
            scale = window_for_dpi.tk.call('tk', 'scaling')
            if scale > 0: return scale
    except tk.TclError:
        pass # 回退到其他方法

    # ctypes 方法 (Windows)
    if platform.system() == "Windows":
        try:
            import ctypes
            user32 = ctypes.windll.user32
            hwnd = window_for_dpi.winfo_id() if hasattr(window_for_dpi, 'winfo_id') and window_for_dpi.winfo_exists() else user32.GetForegroundWindow()
            if hwnd: 
                scale_factor_from_dpi = user32.GetDpiForWindow(hwnd) / 96.0
                if scale_factor_from_dpi > 0: 
                    return scale_factor_from_dpi
        except Exception:
            pass 
    return 1.0

# --- 样式和主题配置 ---
class AppStyle:
    def __init__(self, root_window, scale_factor_val):
        self.scale_factor = scale_factor_val if scale_factor_val > 0 else 1.0 
        self.style = ttk.Style(root_window)
        self.theme_applied_name = None

        if TTK_THEMES_AVAILABLE:
            preferred_themes = ['arc', 'adapta', 'plastik', 'radiance', 'clearlooks', 'clam']
            for theme_name in preferred_themes:
                try:
                    self.style.theme_use(theme_name)
                    self.theme_applied_name = theme_name
                    break
                except tk.TclError:
                    continue
            if not self.theme_applied_name:
                try: self.style.theme_use('clam')
                except: pass
        else:
            try: self.style.theme_use('clam')
            except: pass


        self.font_family_main = "Segoe UI" if platform.system() == "Windows" else "Arial"
        self.font_size_base = int(10 * self.scale_factor)
        self.font_size_label = self.font_size_base
        self.font_size_entry = self.font_size_base
        self.font_size_button = int(10.5 * self.scale_factor)
        self.font_size_combo = self.font_size_base
        self.font_size_header = int(13 * self.scale_factor)
        self.font_size_small_note = int(8.5 * self.scale_factor)

        def ensure_min_font_size(size):
            return max(1, size)

        self.font_label = tkfont.Font(family=self.font_family_main, size=ensure_min_font_size(self.font_size_label))
        self.font_entry = tkfont.Font(family=self.font_family_main, size=ensure_min_font_size(self.font_size_entry))
        self.font_button = tkfont.Font(family=self.font_family_main, size=ensure_min_font_size(self.font_size_button), weight="bold")
        self.font_combo = tkfont.Font(family=self.font_family_main, size=ensure_min_font_size(self.font_size_combo))
        self.font_header = tkfont.Font(family=self.font_family_main, size=ensure_min_font_size(self.font_size_header), weight="bold")
        self.font_small_note = tkfont.Font(family=self.font_family_main, size=ensure_min_font_size(self.font_size_small_note))

        self.COLOR_TEXT = "#333333"
        self.COLOR_PLACEHOLDER = "grey"
        try:
            self.COLOR_PRIMARY_BG = self.style.lookup('TFrame', 'background')
        except tk.TclError: 
            self.COLOR_PRIMARY_BG = "#F0F0F0" 


        self.style.configure("TLabel", font=self.font_label)
        self.style.configure("TEntry", font=self.font_entry, padding=(int(5*self.scale_factor), int(5*self.scale_factor)))
        self.style.configure("TCombobox", font=self.font_combo, padding=(int(5*self.scale_factor)))
        self.style.configure("TLabelframe.Label", font=self.font_label)
        self.style.configure("Accent.TButton", font=self.font_button, padding=(int(10*self.scale_factor), int(8*self.scale_factor)))
        self.style.configure("TButton", font=self.font_button, padding=(int(10*self.scale_factor), int(8*self.scale_factor)))

# --- UI 事件处理函数 ---
def on_provider_select(event=None):
    global api_key_input_area_container 
    if not api_key_input_area_container: return 

    selected_provider_name = selected_provider_var.get()
    for provider_name, config in providers_config.items():
        if 'frame' in config and config['frame']:
            if provider_name == selected_provider_name:
                config['frame'].grid(row=0, column=0, sticky="nsew", pady=(int(5*app_style.scale_factor), int(2*app_style.scale_factor)))
                api_key_input_area_container.grid_rowconfigure(0, weight=1)
                api_key_input_area_container.grid_columnconfigure(0, weight=1)
            else:
                config['frame'].grid_forget()

def handle_focus_in(event, placeholder_text_val, string_var_val, entry_widget):
    if string_var_val.get() == placeholder_text_val:
        string_var_val.set("")
        try:
            default_fg = app_style.style.lookup('TEntry', 'foreground')
            entry_widget.config(foreground=default_fg)
        except (AttributeError, tk.TclError): 
            entry_widget.config(foreground='black') 

def handle_focus_out(event, placeholder_text_val, string_var_val, entry_widget):
    if not string_var_val.get().strip():
        string_var_val.set(placeholder_text_val)
        entry_widget.config(foreground=app_style.COLOR_PLACEHOLDER if app_style else "grey")

# --- 核心逻辑函数 ---
def load_keys_from_env():
    """Loads existing keys from the .env file."""
    env_vars = {}
    if os.path.exists(ENV_PATH):
        try:
            with open(ENV_PATH, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        key, value = line.split("=", 1)
                        env_vars[key.strip()] = value.strip()
        except Exception as e:
            messagebox.showwarning("读取错误", f"无法读取 .env 文件: {e}\n将假定为空白配置。", parent=root if root else None)
    return env_vars

def _validate_and_collect_keys():
    """Validates all GUI inputs and collects non-empty, non-placeholder values. Focuses on first error."""
    keys_to_save = {}
    validation_passed = True
    first_failed_entry_info = None

    for provider_name, config in providers_config.items(): # Iterate all providers for validation
        env_var_name = config["env_var"]
        key_value = config["string_var"].get().strip()
        placeholder = config.get("placeholder", "")
        
        if key_value == placeholder: # Treat placeholder as empty for validation purposes
            key_value = ""
        
        if key_value: # Only validate if there's actual input
            keys_to_save[env_var_name] = key_value # Store it regardless for now, merge logic will handle

            if " " in key_value or len(key_value) < 10:
                messagebox.showerror("输入错误", f"为 {provider_name} 输入的 API Key 无效或过短。", parent=root)
                validation_passed = False
                if not first_failed_entry_info: first_failed_entry_info = (env_var_name, provider_name)
                break # Stop on first error
            
            prefix_checks = {
                "ANTHROPIC_API_KEY_SECRET": ("sk-ant-", "Anthropic API Key 通常以 'sk-ant-' 开头。"),
                "OPENAI_API_KEY_SECRET": ("sk-", "OpenAI API Key 通常以 'sk-' 开头。"),
                "DEEPSEEK_API_KEY_SECRET": ("sk-", "DeepSeek API Key 通常以 'sk-' 开头。"),
                "SILICONFLOW_API_KEY_SECRET": ("sk-", "SiliconFlow API Key 通常以 'sk-' 开头。")
            }
            if env_var_name in prefix_checks:
                prefix, error_msg = prefix_checks[env_var_name]
                if not key_value.startswith(prefix):
                    messagebox.showerror("输入错误", error_msg, parent=root)
                    validation_passed = False
                    if not first_failed_entry_info: first_failed_entry_info = (env_var_name, provider_name)
                    break # Stop on first error
    
    if not validation_passed and first_failed_entry_info:
        failed_env_var, failed_provider_name = first_failed_entry_info
        if selected_provider_var.get() != failed_provider_name:
            selected_provider_var.set(failed_provider_name)
            on_provider_select() 
        if entry_widgets_map.get(failed_env_var):
             target_entry = entry_widgets_map[failed_env_var]
             # Delay focus slightly to ensure UI updates (like tab switch) complete
             root.after(50, lambda e=target_entry: e.focus_set())
             root.after(60, lambda e=target_entry: e.selection_range(0, tk.END))
    
    # Returns ALL non-empty, non-placeholder keys from GUI, and validation status
    return keys_to_save, validation_passed, first_failed_entry_info


def save_keys_to_env():
    # 1. Validate all current GUI inputs.
    # _validate_and_collect_keys focuses on errors if any.
    # We don't directly use its returned 'keys_to_save' for the final write,
    # as we need to consider existing .env values and user deletions.
    _, validation_passed, _ = _validate_and_collect_keys()

    if not validation_passed:
        return False # Validation failed, user has been notified, error field focused.

    # 2. Load existing keys from .env file
    env_data_on_disk = load_keys_from_env()

    # 3. Prepare the final set of keys to write, starting with what's on disk.
    # Keys not managed by this GUI (if any) will be preserved.
    final_keys_to_write = env_data_on_disk.copy()

    # 4. Iterate through all GUI-managed providers to update/remove keys
    # This ensures that if a user clears a field, the key is removed from .env
    something_changed_by_gui = False
    for provider_display_name, config in providers_config.items():
        env_var_name = config["env_var"]
        gui_value = config["string_var"].get().strip()
        placeholder = config.get("placeholder", "")
        original_value_from_disk = env_data_on_disk.get(env_var_name)

        if gui_value and gui_value != placeholder:
            # User entered or kept a non-placeholder value for this provider
            if final_keys_to_write.get(env_var_name) != gui_value:
                final_keys_to_write[env_var_name] = gui_value
                something_changed_by_gui = True
        else:
            # User cleared the field or left it as placeholder for this provider.
            # So, if this key was in the .env (or in final_keys_to_write), remove it.
            if env_var_name in final_keys_to_write:
                del final_keys_to_write[env_var_name]
                something_changed_by_gui = True
            elif original_value_from_disk is not None: # It was on disk but not in final_keys_to_write (edge case)
                something_changed_by_gui = True


    # 5. Handle confirmation if the resulting .env will be empty
    if not final_keys_to_write and something_changed_by_gui : # Only ask if GUI changes led to empty
        if not messagebox.askyesno("确认操作",
                                   "所有 API Key 字段均为空或将被清空。\n"
                                   "确定要继续吗？\n"
                                   "(如果 .env 文件已存在，其内容将被清空)",
                                   parent=root):
            return False # User cancelled

    # 6. Write to .env file
    try:
        with open(ENV_PATH, "w", encoding="utf-8") as f:
            if final_keys_to_write:
                for key_name, key_value in final_keys_to_write.items():
                    f.write(f"{key_name}={key_value}\n")
            # If final_keys_to_write is empty, this creates/empties the .env file
        
        num_keys_saved = len(final_keys_to_write)
        if num_keys_saved > 0:
            save_message = f"已成功更新 {num_keys_saved} 个 API Key 到 .env 文件！"
        else:
            save_message = "已将 .env 文件更新 (当前为空，因为没有提供 API Key 或所有 Key 已被清除)。"
        messagebox.showinfo("保存成功", save_message, parent=root)
        return True
        
    except IOError as e:
        messagebox.showerror("文件错误", f"无法写入 .env 文件: {e}", parent=root)
        return False
    except Exception as e:
        messagebox.showerror("未知错误", f"保存时发生错误: {e}", parent=root)
        return False

def launch_application():
    if os.path.exists(START_BAT_PATH):
        messagebox.showinfo("启动应用", f"即将通过 {START_BAT_NAME} 启动应用...", parent=root)
        try:
            if platform.system() == 'Windows':
                os.system(f'start "LocalGPT Dev Server" "{START_BAT_PATH}"')
            elif platform.system() == 'Darwin': 
                if START_BAT_NAME.endswith(".sh") or START_BAT_NAME.endswith(".command"):
                    os.chmod(START_BAT_PATH, 0o755) 
                    os.system(f'open -a Terminal.app "{START_BAT_PATH}"') 
                else:
                    messagebox.showwarning("启动提示", f"在 macOS 上，{START_BAT_NAME} 可能需要手动执行。\n您可以尝试在终端运行它。", parent=root)
                    return 
            else: # Linux
                os.chmod(START_BAT_PATH, 0o755)
                terminals = [
                    'gnome-terminal -- "{}"', 'konsole -e "{}"',
                    'xfce4-terminal -e "{}"', 'xterm -e "{}"'
                ]
                launched = False
                for term_cmd in terminals:
                    try:
                        os.system(term_cmd.format(START_BAT_PATH) + " &") 
                        launched = True
                        break
                    except Exception:
                        continue
                if not launched:
                    os.system(f'"{START_BAT_PATH}" &') 
                messagebox.showinfo("启动提示", f"已尝试启动 {START_BAT_NAME}。\n如果应用未自动启动，请检查终端输出或手动运行它。", parent=root)
            
            if root and root.winfo_exists(): 
                 root.after(1000, root.destroy) 
        except Exception as e_launch:
            messagebox.showerror("启动错误", f"启动脚本时发生错误: {e_launch}\n请尝试手动运行。", parent=root)
            return
    else:
        messagebox.showerror("启动错误", f"启动脚本 {START_BAT_NAME} 未找到于: {PROJECT_DIR}", parent=root)

def save_and_launch():
    if save_keys_to_env():
        launch_application()

# --- 主窗口和UI构建 ---
def create_main_window():
    global root, selected_provider_var, app_style, api_key_input_area_container, providers_config

    if TTK_THEMES_AVAILABLE:
        root = ThemedTk(theme="arc")
    else:
        root = tk.Tk()

    root.title("API Key 配置与启动")
    root.configure(bg="#f4f6fa")

    root.update_idletasks()
    _initial_scale_factor = get_dpi_scale_factor(root)
    app_style = AppStyle(root, _initial_scale_factor)

    main_padding = int(26 * app_style.scale_factor)
    main_frame = ttk.Frame(root, padding=main_padding)
    main_frame.pack(expand=True, fill=tk.BOTH)

    app_title_label = ttk.Label(
        main_frame,
        text="API Key 配置与启动",
        font=("Segoe UI", int(22*app_style.scale_factor), "bold"),
        anchor="center",
        foreground="#364f6b"
    )
    app_title_label.pack(pady=(0, int(18 * app_style.scale_factor)), fill=tk.X)

    provider_select_labelframe = ttk.Labelframe(
        main_frame,
        text="1. 选择 API 服务商",
        padding=(int(12*app_style.scale_factor), int(9*app_style.scale_factor)),
    )
    provider_select_labelframe.pack(fill=tk.X, pady=(0, int(14 * app_style.scale_factor)))

    selected_provider_var = tk.StringVar()
    _providers_setup_data = [
        ("Claude (Anthropic)", "ANTHROPIC_API_KEY_SECRET", "Anthropic (Claude) API Key:", "例如: sk-ant-api03-..."),
        ("OpenAI (GPT)", "OPENAI_API_KEY_SECRET", "OpenAI (GPT) API Key:", "例如: sk-..."),
        ("DeepSeek", "DEEPSEEK_API_KEY_SECRET", "DeepSeek API Key:", "例如: sk-..."),
        ("Google Gemini", "GEMINI_API_KEY_SECRET", "Google AI (Gemini) API Key:", "例如: AIzaSy..."),
        ("SiliconFlow", "SILICONFLOW_API_KEY_SECRET", "SiliconFlow API Key:", "例如: sk-..."),
    ]

    existing_env_values = load_keys_from_env()

    provider_names_for_combobox = []
    providers_config = {}
    for display_name, env_var, label_text, placeholder in _providers_setup_data:
        provider_names_for_combobox.append(display_name)
        s_var = tk.StringVar()
        initial_value = existing_env_values.get(env_var, placeholder)
        s_var.set(initial_value)
        providers_config[display_name] = {
            "env_var": env_var, "label_text": label_text, "placeholder": placeholder,
            "string_var": s_var, "frame": None,
        }

    provider_combobox = ttk.Combobox(
        provider_select_labelframe, textvariable=selected_provider_var,
        values=provider_names_for_combobox, state="readonly",
        font=app_style.font_combo, width=35
    )
    provider_combobox.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, int(5*app_style.scale_factor)))
    provider_combobox.bind("<<ComboboxSelected>>", on_provider_select)

    api_key_input_labelframe = ttk.Labelframe(
        main_frame,
        text="2. 输入所选服务商的 API Key",
        padding=(int(12*app_style.scale_factor), int(12*app_style.scale_factor)),
    )
    api_key_input_labelframe.pack(fill=tk.BOTH, expand=True, pady=(0, int(13 * app_style.scale_factor)))

    api_key_input_area_container = ttk.Frame(api_key_input_labelframe)
    api_key_input_area_container.pack(fill=tk.BOTH, expand=True)
    api_key_input_area_container.grid_rowconfigure(0, weight=1)
    api_key_input_area_container.grid_columnconfigure(0, weight=1)

    for display_name, config in providers_config.items():
        frame = ttk.Frame(api_key_input_area_container, padding=(0, int(5*app_style.scale_factor)))
        config["frame"] = frame
        ttk.Label(
            frame, text=config["label_text"], font=app_style.font_label
        ).pack(anchor='w', pady=(0,int(3*app_style.scale_factor)))
        entry = ttk.Entry(
            frame, textvariable=config["string_var"], font=app_style.font_entry, width=60
        )
        if config["string_var"].get() == config["placeholder"]:
            entry.config(foreground="#a3b0c0")
        else:
            try:
                default_fg = app_style.style.lookup('TEntry', 'foreground')
                entry.config(foreground=default_fg)
            except Exception:
                entry.config(foreground="#364f6b")
        entry.bind("<FocusIn>", lambda e, p=config["placeholder"], v=config["string_var"], widget=entry: handle_focus_in(e, p, v, widget))
        entry.bind("<FocusOut>", lambda e, p=config["placeholder"], v=config["string_var"], widget=entry: handle_focus_out(e, p, v, widget))
        entry.pack(fill=tk.X, ipady=int(4*app_style.scale_factor), expand=True)
        entry_widgets_map[config["env_var"]] = entry

    if provider_names_for_combobox:
        selected_provider_var.set(provider_names_for_combobox[0])
        on_provider_select()

    safety_label = ttk.Label(
        main_frame,
        text="所有 API Key 仅保存在本地 .env 文件，不会上传云端。请妥善保管。",
        font=("Segoe UI", int(9.5*app_style.scale_factor)),
        foreground="#7a859c",
        anchor="center",
    )
    safety_label.pack(pady=(8, 2), fill=tk.X)

    button_frame = ttk.Frame(main_frame)
    button_frame.pack(fill=tk.X, pady=(int(12 * app_style.scale_factor), 0))
    button_frame.columnconfigure(0, weight=1)
    button_frame.columnconfigure(1, weight=1)

    save_only_button = ttk.Button(
        button_frame, text="💾 仅保存 Keys", command=save_keys_to_env
    )
    save_only_button.grid(row=0, column=0, sticky=tk.EW, padx=(0, int(8 * app_style.scale_factor)), ipady=int(6*app_style.scale_factor))

    save_launch_button = ttk.Button(
        button_frame, text="🚀 保存并启动", command=save_and_launch
    )
    save_launch_button.grid(row=0, column=1, sticky=tk.EW, padx=(int(8 * app_style.scale_factor), 0), ipady=int(6*app_style.scale_factor))

    # “可选安装 ttkthemes”提示
    if not TTK_THEMES_AVAILABLE:
        status_text = "提示: 可选安装 `ttkthemes` (pip install ttkthemes) 以获得更丰富的界面主题。"
        status_label = ttk.Label(main_frame, text=status_text, font=app_style.font_small_note, relief=tk.GROOVE, anchor=tk.W, padding=(int(5*app_style.scale_factor)))
        status_label.pack(side=tk.BOTTOM, fill=tk.X, pady=(int(8*app_style.scale_factor),0), ipady=int(3*app_style.scale_factor))

    root.protocol("WM_DELETE_WINDOW", root.destroy)
    root.mainloop()

if __name__ == "__main__":
    create_main_window()
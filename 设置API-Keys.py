import os
import sys
import platform
import tkinter as tk
from tkinter import ttk, messagebox, font as tkfont

# ====== 全局常量 ======
START_BAT = "start.bat"

# 获取工程目录(可打包或未打包)
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

ENV_FILE = os.path.join(BASE_DIR, '.env')
START_BAT_PATH = os.path.join(BASE_DIR, START_BAT)

# ====== 配色 & 样式 ======
PRIMARY = '#1976D2'
PRIMARY_DARK = '#1565C0'
BG_LIGHT = '#F4F6F8'
FG_DARK = '#222222'
PLACEHOLDER = '#888888'

class AppStyle:
    def __init__(self, root):
        base_font = 'Segoe UI' if platform.system() == 'Windows' else 'Arial'
        self.font_title = (base_font, 16, 'bold')
        self.font_label = (base_font, 12)
        self.font_button = tkfont.Font(family=base_font, size=13, weight='bold')
        self.font_tip = (base_font, 12)
        style = ttk.Style(root)
        try:
            style.theme_use('clam')
        except:
            pass
        style.configure('TLabel', background=BG_LIGHT)
        style.configure('Accent.TButton', font=self.font_button, foreground='white', background=PRIMARY, padding=(14,10))
        style.map('Accent.TButton', background=[('active', PRIMARY_DARK), ('pressed', PRIMARY_DARK)])
        style.configure('Secondary.TButton', font=self.font_button, foreground=FG_DARK, background='white', borderwidth=1, relief='solid', padding=(14,10))
        style.map('Secondary.TButton', background=[('active', '#e0e0e0'), ('pressed', '#cccccc')])

class ApiKeyManager:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title('API Key 配置与启动')
        self.root.configure(bg=BG_LIGHT)
        self.style = AppStyle(self.root)
        # 服务列表: (显示名, 环境变量前缀, 占位提示)
        self.providers = [
            ('Anthropic Claude', 'ANTHROPIC_API_KEY', '例如: sk-ant-...'),
            ('OpenAI GPT', 'OPENAI_API_KEY', '例如: sk-...'),
            ('DeepSeek', 'DEEPSEEK_API_KEY', '例如: sk-...'),
            ('Google Gemini', 'GEMINI_API_KEY', '例如: AIzaSy...'),
            ('SiliconFlow', 'SILICONFLOW_API_KEY', '例如: sk-...'),
            ('OpenRouter', 'OPENROUTER_API_KEY', '例如: sk-or-...'),
            ('算了吧 (Suanlema)', 'SUANLEMA_API_KEY', '例如: slm_...'),
        ]
        # 自动加载本地 .env
        self.env_data = {}
        self._load_env()
        self._build_ui()
        self.root.mainloop()

    def _load_env(self):
        """读取 .env，将所有键值存入 env_data"""
        self.env_data.clear()
        if os.path.exists(ENV_FILE):
            with open(ENV_FILE, 'r', encoding='utf-8') as f:
                for ln in f:
                    if '=' in ln and not ln.strip().startswith('#'):
                        k, v = ln.strip().split('=', 1)
                        self.env_data[k] = v

    def _get_key_value(self, prefix):
        """尝试以 prefix 或 prefix + '_SECRET' 为键获取值"""
        return self.env_data.get(prefix) or self.env_data.get(prefix + '_SECRET', '')

    def _build_ui(self):
        frm = ttk.Frame(self.root, padding=20)
        frm.pack(fill='both', expand=True)

        # 标题
        lbl_title = ttk.Label(frm, text='API Key 配置与启动', font=self.style.font_title, foreground=PRIMARY)
        lbl_title.pack(pady=(0,15))

        # 下拉选择
        self.var_sel = tk.StringVar()
        names = [p[0] for p in self.providers]
        cb = ttk.Combobox(frm, values=names, textvariable=self.var_sel, state='readonly', font=self.style.font_label)
        cb.pack(fill='x')
        cb.bind('<<ComboboxSelected>>', self._on_select)
        self.var_sel.set(names[0])

        # 输入区
        self.entries = {}
        input_frame = ttk.Frame(frm)
        input_frame.pack(fill='both', expand=True, pady=10)
        for name, prefix, ph in self.providers:
            sv = tk.StringVar()
            val = self._get_key_value(prefix)
            sv.set(val if val else ph)
            ent = ttk.Entry(input_frame, textvariable=sv, font=self.style.font_label)
            ent.pack(fill='x', pady=6)
            ent.config(foreground=FG_DARK if val else PLACEHOLDER)
            ent.bind('<FocusIn>', lambda e, sv=sv, ph=ph, ent=ent: self._focus_in(sv, ph, ent))
            ent.bind('<FocusOut>', lambda e, sv=sv, ph=ph, ent=ent: self._focus_out(sv, ph, ent))
            self.entries[name] = (prefix, sv, ph, ent)
            ent.forget()

        # 初始显示并自动填充
        self._on_select()

        # 按钮区
        btn_frame = ttk.Frame(frm)
        btn_frame.pack(fill='x', pady=(5,0))
        btn_save = ttk.Button(btn_frame, text='保存 Keys', style='Secondary.TButton', command=self._save)
        btn_save.pack(side='left', expand=True, fill='x', padx=5)
        btn_launch = ttk.Button(btn_frame, text='保存并启动', style='Accent.TButton', command=self._save_and_launch)
        btn_launch.pack(side='right', expand=True, fill='x', padx=(5,0))

        # 提示文案
        lbl_tip = ttk.Label(frm, text='🔒 本地保存，不上传云端', font=self.style.font_tip, foreground=PLACEHOLDER)
        lbl_tip.pack(pady=(10,0))

    def _on_select(self, event=None):
        sel = self.var_sel.get()
        for name, (_, _, _, ent) in self.entries.items():
            ent.forget()
        prefix, sv, ph, ent = self.entries[sel]
        ent.pack(fill='x', pady=6)

    def _focus_in(self, sv, ph, ent):
        if sv.get() == ph:
            sv.set('')
            ent.config(foreground=FG_DARK)

    def _focus_out(self, sv, ph, ent):
        if not sv.get().strip():
            sv.set(ph)
            ent.config(foreground=PLACEHOLDER)

    def _save(self):
        data = {}
        for _, (prefix, sv, ph, _) in self.entries.items():
            v = sv.get().strip()
            if v and v != ph:
                # 保存时统一使用 prefix + '_SECRET'
                data[prefix + '_SECRET'] = v
        if not data:
            if not messagebox.askyesno('确认', '未填写 Keys，仍保存？', parent=self.root):
                return
        try:
            with open(ENV_FILE, 'w', encoding='utf-8') as f:
                for k, v in data.items():
                    f.write(f"{k}={v}\n")
            messagebox.showinfo('成功', '.env 文件已保存', parent=self.root)
        except Exception as e:
            messagebox.showerror('错误', f'写入失败: {e}', parent=self.root)

    def _save_and_launch(self):
        self._save()
        if os.path.exists(START_BAT_PATH):
            if platform.system() == 'Windows':
                os.system(f'start "" "{START_BAT_PATH}"')
            else:
                os.system(f'chmod +x "{START_BAT_PATH}" && "{START_BAT_PATH}" &')
            self.root.after(500, self.root.destroy)
        else:
            messagebox.showerror('错误', f'{START_BAT} 不存在', parent=self.root)

if __name__ == '__main__':
    ApiKeyManager()

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
PRIMARY_LIGHT = '#90CAF9'
PRIMARY_DARK = '#0D47A1'
SECONDARY = '#FF6D00'
BG_LIGHT = '#F5F7FA'
BG_CARD = '#FFFFFF'
FG_DARK = '#263238'
PLACEHOLDER = '#90A4AE'
ACCENT = '#26A69A'
ERROR = '#F44336'

class AppStyle:
    def __init__(self, root):
        base_font = 'Segoe UI' if platform.system() == 'Windows' else 'Arial'
        self.font_title = (base_font, 18, 'bold')
        self.font_subtitle = (base_font, 12, 'bold')
        self.font_label = (base_font, 12)
        self.font_button = tkfont.Font(family=base_font, size=13, weight='bold')
        self.font_tip = (base_font, 11)
        
        style = ttk.Style(root)
        try:
            style.theme_use('clam')
        except:
            pass
        
        # 全局样式
        root.configure(bg=BG_LIGHT)
        style.configure('.', background=BG_LIGHT)
        
        # 卡片样式
        style.configure('Card.TFrame', background=BG_CARD, borderwidth=1, 
                        relief='solid', lightcolor='#E0E0E0', darkcolor='#E0E0E0')
        
        # 标签样式
        style.configure('Title.TLabel', font=self.font_title, foreground=PRIMARY_DARK)
        style.configure('Subtitle.TLabel', font=self.font_subtitle, foreground=FG_DARK)
        
        # 按钮样式
        style.configure('Accent.TButton', font=self.font_button, foreground='white', 
                        background=PRIMARY, padding=(14, 10), borderwidth=0)
        style.map('Accent.TButton', 
                  background=[('active', PRIMARY_DARK), ('pressed', PRIMARY_DARK)])
        
        style.configure('Secondary.TButton', font=self.font_button, foreground=FG_DARK, 
                        background='#F5F5F5', borderwidth=1, relief='solid', padding=(14, 10))
        style.map('Secondary.TButton', 
                  background=[('active', '#EEEEEE'), ('pressed', '#E0E0E0')])
        
        # 输入框样式
        style.configure('TEntry', fieldbackground='white', foreground=FG_DARK, 
                        padding=8, relief='solid', borderwidth=1)
        style.map('TEntry', 
                 bordercolor=[('focus', PRIMARY), ('!focus', '#BDBDBD')],
                 lightcolor=[('focus', PRIMARY), ('!focus', '#BDBDBD')],
                 darkcolor=[('focus', PRIMARY), ('!focus', '#BDBDBD')])
        
        # 下拉框样式
        style.configure('TCombobox', fieldbackground='white', padding=8)
        style.map('TCombobox', 
                 bordercolor=[('focus', PRIMARY), ('!focus', '#BDBDBD')],
                 lightcolor=[('focus', PRIMARY), ('!focus', '#BDBDBD')],
                 darkcolor=[('focus', PRIMARY), ('!focus', '#BDBDBD')])

class ApiKeyManager:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title('API Key 配置中心')
        self.root.geometry('600x500')
        self.root.resizable(False, False)
        self.style = AppStyle(self.root)
        
        # 服务列表: (显示名, 环境变量前缀, 占位提示)
        self.providers = [
            ('Anthropic Claude', 'ANTHROPIC_API_KEY', '例如: sk-ant-...'),
            ('OpenAI GPT', 'OPENAI_API_KEY', '例如: sk-...'),
            ('DeepSeek', 'DEEPSEEK_API_KEY', '例如: sk-...'),
            ('Google Gemini', 'GEMINI_API_KEY', '例如: AIzaSy...'),
            ('SiliconFlow（硅基流动）', 'SILICONFLOW_API_KEY', '例如: sk-...'),
            ('OpenRouter', 'OPENROUTER_API_KEY', '例如: sk-or-...'),
            ('Suanlema（算了吗）', 'SUANLEMA_API_KEY_SECRET', '例如: slm_...'),
            ('VOLCENGINE（火山引擎）', 'VOLCENGINE_API_KEY_SECRET', '例如: ...'),
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
        # 主容器
        main_frame = ttk.Frame(self.root, padding=(30, 20))
        main_frame.pack(fill='both', expand=True)
        
        # 标题区
        header_frame = ttk.Frame(main_frame)
        header_frame.pack(fill='x', pady=(0, 15))
        
        # 添加图标 (使用Unicode符号作为替代)
        icon_label = ttk.Label(header_frame, text='🔑', font=('Arial', 24))
        icon_label.pack(side='left', padx=(0, 10))
        
        title_frame = ttk.Frame(header_frame)
        title_frame.pack(side='left', fill='x', expand=True)
        
        lbl_title = ttk.Label(title_frame, text='API Key 配置中心', style='Title.TLabel')
        lbl_title.pack(anchor='w')
        
        lbl_subtitle = ttk.Label(title_frame, text='安全配置您的服务密钥', 
                                style='Subtitle.TLabel', foreground=PLACEHOLDER)
        lbl_subtitle.pack(anchor='w')
        
        # 卡片容器
        card = ttk.Frame(main_frame, style='Card.TFrame', padding=(25, 20))
        card.pack(fill='both', expand=True, pady=(0, 20))
        
        # 下拉选择
        lbl_provider = ttk.Label(card, text='选择服务提供商:', style='Subtitle.TLabel')
        lbl_provider.pack(anchor='w', pady=(0, 8))
        
        self.var_sel = tk.StringVar()
        names = [p[0] for p in self.providers]
        cb = ttk.Combobox(card, values=names, textvariable=self.var_sel, 
                         state='readonly', font=self.style.font_label)
        cb.pack(fill='x', pady=(0, 15))
        cb.bind('<<ComboboxSelected>>', self._on_select)
        self.var_sel.set(names[0])
        
        # 输入区
        input_frame = ttk.Frame(card)
        input_frame.pack(fill='both', expand=True, pady=10)
        
        lbl_key = ttk.Label(input_frame, text='API Key:', style='Subtitle.TLabel')
        lbl_key.pack(anchor='w', pady=(0, 8))
        
        self.entries = {}
        for name, prefix, ph in self.providers:
            sv = tk.StringVar()
            val = self._get_key_value(prefix)
            sv.set(val if val else ph)
            ent = ttk.Entry(input_frame, textvariable=sv, font=self.style.font_label)
            ent.pack(fill='x', pady=(0, 10), ipady=8)
            ent.config(foreground=FG_DARK if val else PLACEHOLDER)
            ent.bind('<FocusIn>', lambda e, sv=sv, ph=ph, ent=ent: self._focus_in(sv, ph, ent))
            ent.bind('<FocusOut>', lambda e, sv=sv, ph=ph, ent=ent: self._focus_out(sv, ph, ent))
            self.entries[name] = (prefix, sv, ph, ent)
            ent.forget()

        # 初始显示并自动填充
        self._on_select()
        
        # 按钮区
        btn_frame = ttk.Frame(card)
        btn_frame.pack(fill='x', pady=(10, 0))
        
        btn_save = ttk.Button(btn_frame, text='保存密钥', style='Secondary.TButton', 
                             command=self._save)
        btn_save.pack(side='left', padx=(0, 10))
        
        btn_launch = ttk.Button(btn_frame, text='保存并启动', style='Accent.TButton', 
                               command=self._save_and_launch)
        btn_launch.pack(side='right')
        
        # 提示文案
        footer_frame = ttk.Frame(main_frame)
        footer_frame.pack(fill='x')
        
        lbl_tip = ttk.Label(footer_frame, text='🔒 所有密钥仅保存在本地 .env 文件中，不上传至任何云端服务器', 
                           font=self.style.font_tip, foreground=PLACEHOLDER)
        lbl_tip.pack(pady=(5, 0))
        
        # 窗口居中
        self._center_window()

    def _center_window(self):
        """将窗口居中显示"""
        self.root.update_idletasks()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f'+{x}+{y}')

    def _on_select(self, event=None):
        sel = self.var_sel.get()
        for name, (_, _, _, ent) in self.entries.items():
            ent.forget()
        prefix, sv, ph, ent = self.entries[sel]
        ent.pack(fill='x', pady=(0, 10), ipady=8)
        
        # 添加动画效果
        ent.configure(foreground=FG_DARK if sv.get() != ph else PLACEHOLDER)

    def _focus_in(self, sv, ph, ent):
        if sv.get() == ph:
            sv.set('')
            ent.configure(foreground=FG_DARK)

    def _focus_out(self, sv, ph, ent):
        if not sv.get().strip():
            sv.set(ph)
            ent.configure(foreground=PLACEHOLDER)

    def _save(self):
        data = {}
        for _, (prefix, sv, ph, _) in self.entries.items():
            v = sv.get().strip()
            if v and v != ph:
                # 保存时统一使用 prefix + '_SECRET'
                data[prefix + '_SECRET'] = v
                
        if not data:
            if not messagebox.askyesno('确认', '未填写任何密钥，仍要保存空配置吗？', parent=self.root):
                return
                
        try:
            with open(ENV_FILE, 'w', encoding='utf-8') as f:
                for k, v in data.items():
                    f.write(f"{k}={v}\n")
            messagebox.showinfo('成功', '配置已成功保存到 .env 文件', parent=self.root)
        except Exception as e:
            messagebox.showerror('错误', f'保存失败: {e}', parent=self.root)

    def _save_and_launch(self):
        self._save()
        if os.path.exists(START_BAT_PATH):
            if platform.system() == 'Windows':
                os.system(f'start "" "{START_BAT_PATH}"')
            else:
                os.system(f'chmod +x "{START_BAT_PATH}" && "{START_BAT_PATH}" &')
            self.root.after(500, self.root.destroy)
        else:
            messagebox.showerror('错误', f'启动文件 {START_BAT} 不存在', parent=self.root)

if __name__ == '__main__':
    ApiKeyManager()
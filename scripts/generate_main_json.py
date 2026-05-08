import os
import json
import urllib.parse
from datetime import datetime, timedelta

# ================= 配置区域 =================
ROOT_ICON_DIR = "icon"
OUTPUT_FILE = "ligeicon.json"
BASE_URL = "https://raw.githubusercontent.com/lige47/QuanX-icon-rule/main/"

# 1. 置顶图标
TOP_ICON_NAME = "lige"

# 2. 不需要扫描的文件夹
EXCLUDE_FOLDERS = ["emby", ".git", ".github"]
# ===========================================

def generate_main_json():
    print(f"🚀 正在生成正式版文件: {OUTPUT_FILE}")
    
    final_list = []
    
    # --- 1. 添加置顶图标 ---
    top_icon_found = False
    if os.path.exists(os.path.join(ROOT_ICON_DIR, f"{TOP_ICON_NAME}.png")):
         final_list.append({"name": TOP_ICON_NAME, "url": f"{BASE_URL}icon/{TOP_ICON_NAME}.png"})
         top_icon_found = True
    
    # --- 2. 扫描所有分类文件夹 ---
    if os.path.exists(ROOT_ICON_DIR):
        subfolders = sorted([
            f for f in os.listdir(ROOT_ICON_DIR) 
            if os.path.isdir(os.path.join(ROOT_ICON_DIR, f)) 
            and f not in EXCLUDE_FOLDERS
            and not f.startswith('.')
        ])

        for folder in subfolders:
            folder_path = os.path.join(ROOT_ICON_DIR, folder)
            images = [f for f in os.listdir(folder_path) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.ico'))]
            images.sort(key=lambda x: x.lower())
            
            if not images: continue
            
            for filename in images:
                name = os.path.splitext(filename)[0]
                
                if name == TOP_ICON_NAME:
                    if not top_icon_found:
                        encoded_name = urllib.parse.quote(filename, safe='()')
                        final_list.insert(0, {
                            "name": name, 
                            "url": f"{BASE_URL}icon/{folder}/{encoded_name}"
                        })
                        top_icon_found = True
                    continue

                encoded_name = urllib.parse.quote(filename, safe='()')
                full_url = f"{BASE_URL}icon/{folder}/{encoded_name}"
                
                final_list.append({"name": name, "url": full_url})

    # ================= 核心修复：智能对比 =================
    # 在生成新日期之前，先看看内容变没变
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
                old_data = json.load(f)
                
            # 获取旧文件里的图标列表
            old_icons = old_data.get('icons', [])
            
            # 对比：如果新生成的列表 和 旧列表 完全一致
            if old_icons == final_list:
                print("⚠️ 检测到图标列表无变化，跳过更新，保留旧版本号。")
                return  # 直接结束函数，不写入文件，也不更新日期
            else:
                print("♻️ 检测到图标变动，准备写入新版本...")
                
        except Exception as e:
            print(f"⚠️ 读取旧文件对比失败 ({e})，将强制更新...")
    # ====================================================

    # --- 3. 生成头部信息 (日期) ---
    # 代码能运行到这里，说明图标肯定变了，或者旧文件不存在
    now_beijing = datetime.utcnow() + timedelta(hours=8)
    version_date = now_beijing.strftime('%y%m%d')
    
    description_text = f"图标更新请关注TG频道：@ligeicon ，您当前版本日期为{version_date}"

    data = {
        "name": "离歌图标包",
        "description": description_text,
        "icons": final_list
    }

    # --- 4. 写入文件 ---
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        
    # --- 5. 斜杠转义 ---
    with open(OUTPUT_FILE, 'r+', encoding='utf-8') as f:
        content = f.read().replace("/", "\\/")
        f.seek(0); f.write(content); f.truncate()
        
    print(f"✅ 正式版已更新: {OUTPUT_FILE} (版本 {version_date})")

if __name__ == "__main__":
    generate_main_json()

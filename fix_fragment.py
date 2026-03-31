path = r'c:\Users\Cashew\.gemini\PPE\factory-dashboard\src\app\(protected)\bao-com\page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Step 1: Wrap return in React.Fragment
old1 = '                                                    return (\n                                                        <tr key={i} className="hover:bg-muted/30 transition-colors">'
new1 = '                                                    return (\n                                                        <React.Fragment key={i}>\n                                                        <tr className="hover:bg-muted/30 transition-colors">'

if old1 in content:
    content = content.replace(old1, new1, 1)
    print("step1 ok")
else:
    print("step1 NOT FOUND")

# Step 2: Close Fragment after the expandable source row
old2 = '                                                        )}\n                                                    )\n                                                })}'
new2 = '                                                        )}\n                                                        </React.Fragment>\n                                                    )\n                                                })}'

if old2 in content:
    c = content.count(old2)
    print(f"step2 pattern found x{c}")
    content = content.replace(old2, new2, 1)
    print("step2 ok")
else:
    print("step2 NOT FOUND")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("done len:", len(content))

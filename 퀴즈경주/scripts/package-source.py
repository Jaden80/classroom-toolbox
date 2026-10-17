"""Package the application without secrets, databases, dependencies, or local QA tokens."""
from pathlib import Path
import zipfile
root = Path(__file__).resolve().parent.parent
destination = root.parent / '퀴즈경주-프로그램.zip'
files = []
for name in ['src', 'shared', 'server', 'tests', 'scripts', 'public', 'dist']:
    files.extend(p for p in (root / name).rglob('*') if p.is_file())
files.extend(p for p in root.iterdir() if p.is_file() and p.name not in ['.env'] and
             (p.suffix in ['.md', '.json', '.ts', '.html', '.bat'] or p.name in ['Dockerfile', '.dockerignore', '.gitignore', '.env.example']))
for name in ['race-preview.png', 'student-preview.png']:
    files.append(root / 'artifacts' / name)
with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as out:
    for path in sorted(set(files)):
        out.write(path, '퀴즈경주/' + path.relative_to(root).as_posix())
with zipfile.ZipFile(destination) as check:
    assert check.testzip() is None
    assert all('/node_modules/' not in n and '/data/' not in n and '/test-results/' not in n and not n.endswith('/.env') for n in check.namelist())
    print(f'프로그램 ZIP 검사 완료: {len(check.namelist())}개 파일, {destination.stat().st_size:,} bytes')

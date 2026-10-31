"""Download source diagrams for private testing; they are never included in the published app."""
from pathlib import Path
import urllib.request
root=Path(__file__).resolve().parent.parent/'private/vision-v4/textbooks';root.mkdir(parents=True,exist_ok=True)
urls={
 'series':'https://www.siyavula.com/read/za/physical-sciences/grade-11/electric-circuits/images/a94939533520153d1cfd5b4a6a795e68.png',
 'meters':'https://www.siyavula.com/read/za/physical-sciences/grade-11/electric-circuits/images/d4b4b63f320531546cc2660962ab85d0.png',
 'parallel':'https://www.siyavula.com/read/za/physical-sciences/grade-10/electric-circuits/images/8742275c78e6e9da87e3c89ca5ec69d6.png',
}
for name,url in urls.items():urllib.request.urlretrieve(url,root/(name+'.png'))
print('Downloaded three source diagrams into ignored private test storage.')

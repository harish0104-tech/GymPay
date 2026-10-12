from pathlib import Path
import pdfplumber
with pdfplumber.open(r'C:\Users\haris\OneDrive\Desktop\GymPay_Dashboard_Requirements_Development_Specification.pdf') as pdf:
 text='\n\n'.join(f'--- PAGE {i+1} ---\n'+(page.extract_text() or '') for i,page in enumerate(pdf.pages))
 Path('tmp/pdfs/spec.txt').write_text(text,encoding='utf-8')
 print(text)
 for i,page in enumerate(pdf.pages):
  page.to_image(resolution=90).save(f'tmp/pdfs/spec-{i+1}.png')

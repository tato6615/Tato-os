import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Language = 'th' | 'en';

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/*
 * TATO customer-site language engine.
 * One language is rendered at a time across the entire document:
 * visible text + placeholders + titles + aria-labels + alt text.
 *
 * Components can keep their existing copy; this layer provides the
 * site-wide switch without changing the product design or business logic.
 */
const DICT: Record<string, [string, string]> = {
  'KNOW YOUR COFFEE.': ['รู้จักกาแฟของคุณ', 'KNOW YOUR COFFEE.'],
  'รู้จักกาแฟของคุณ': ['รู้จักกาแฟของคุณ', 'KNOW YOUR COFFEE.'],
  'EXPLORE TATO': ['สำรวจ TATO', 'EXPLORE TATO'],
  'VIEW ROASTS': ['ดูระดับการคั่ว', 'VIEW ROASTS'],
  'DISCOVER': ['ค้นพบ', 'DISCOVER'],
  'ค้นพบ': ['ค้นพบ', 'DISCOVER'],
  'ORIGIN': ['แหล่งกำเนิด', 'ORIGIN'],
  'ROASTS': ['ระดับการคั่ว', 'ROASTS'],
  'PRODUCT': ['สินค้า', 'PRODUCT'],
  'สั่งซื้อเมล็ดกาแฟ': ['สั่งซื้อเมล็ดกาแฟ', 'ORDER COFFEE'],
  'ORDER TATO': ['สั่งซื้อ TATO', 'ORDER TATO'],
  'Single-Origin Terroir Reserve': ['กาแฟซิงเกิลออริจินจากแหล่งปลูกเฉพาะ', 'Single-Origin Terroir Reserve'],
  'Arabica 100% • Single Origin • Doi Wiang 1,250m': ['อาราบิก้า 100% • ซิงเกิลออริจิน • ดอยเวียง 1,250 ม.', 'Arabica 100% • Single Origin • Doi Wiang 1,250m'],
  '01 / ORIGIN': ['01 / แหล่งกำเนิด', '01 / ORIGIN'],
  'FROM DOI WIANG.': ['จากดอยเวียง', 'FROM DOI WIANG.'],
  'จากแหล่งกำเนิดบนดอยเวียง': ['จากแหล่งกำเนิดบนดอยเวียง', 'From Doi Wiang'],
  'Highland Cloud Mist & Shade-Grown Microclimate': ['หมอกภูเขาและสภาพอากาศเฉพาะถิ่นใต้ร่มเงา', 'Highland Cloud Mist & Shade-Grown Microclimate'],
  'ELEVATION': ['ความสูง', 'ELEVATION'],
  'PURlTY': ['ความบริสุทธิ์', 'PURITY'],
  'PURITY': ['ความบริสุทธิ์', 'PURITY'],
  'TERROIR': ['แหล่งกำเนิดและสภาพพื้นที่', 'TERROIR'],
  'High-altitude cool air slows photosynthesis, dense bean structure.': ['อากาศเย็นบนพื้นที่สูงช่วยชะลอการสังเคราะห์แสง ทำให้เมล็ดมีโครงสร้างแน่น', 'High-altitude cool air slows photosynthesis, dense bean structure.'],
  'Pure single-estate Catimor & Typica lineage. No blends, no compromises.': ['สายพันธุ์ Catimor และ Typica จากแหล่งปลูกเดียว 100% ไม่ผสม และไม่ประนีประนอมด้านคุณภาพ', 'Pure single-estate Catimor & Typica lineage. No blends, no compromises.'],
  'Chiang Rai Highlands': ['พื้นที่สูงเชียงราย', 'Chiang Rai Highlands'],
  'Rich forest humus soil, continuous shade canopies, clean alpine spring water.': ['ดินฮิวมัสจากป่า ร่มเงาต่อเนื่อง และน้ำจากแหล่งภูเขาที่สะอาด', 'Rich forest humus soil, continuous shade canopies, clean alpine spring water.'],
  '02 / BEAN': ['02 / เมล็ดกาแฟ', '02 / BEAN'],
  'BEFORE THE ROAST.': ['ก่อนเข้าสู่การคั่ว', 'BEFORE THE ROAST.'],
  'ก่อนเข้าสู่การคั่ว': ['ก่อนเข้าสู่การคั่ว', 'Before the Roast'],
  'Selective Hand-Pick': ['คัดเก็บด้วยมืออย่างพิถีพิถัน', 'Selective Hand-Pick'],
  'Only blood-red cherries at 22+ Brix density are harvested during the December freeze.': ['เก็บเฉพาะผลเชอร์รี่สีแดงเข้มที่มีความหนาแน่น 22+ Brix ในช่วงอากาศหนาวเดือนธันวาคม', 'Only blood-red cherries at 22+ Brix density are harvested during the December freeze.'],
  'Obsessive Grading. Zero Defect Philosophy.': ['คัดเกรดอย่างละเอียด แนวคิดคือศูนย์ข้อบกพร่อง', 'Obsessive Grading. Zero Defect Philosophy.'],
  'Anaerobic & Washed': ['หมักแบบไร้ออกซิเจนและ Washed', 'Anaerobic & Washed'],
  'Raised Solar Beds': ['ตากบนแคร่ยกสูง', 'Raised Solar Beds'],
  'HARVEST METHOD:': ['วิธีเก็บเกี่ยว:', 'HARVEST METHOD:'],
  'DRYING PROCESS:': ['กระบวนการตาก:', 'DRYING PROCESS:'],
  'DEFECT RATE:': ['อัตราข้อบกพร่อง:', 'DEFECT RATE:'],
  '03 / ROAST': ['03 / การคั่ว', '03 / ROAST'],
  'ROAST PROFILES.': ['ระดับการคั่ว', 'ROAST PROFILES.'],
  'คัดสรรระดับการคั่วที่ดึงรสชาติเฉพาะตัวออกมาอย่างสมบูรณ์แบบ': ['คัดสรรระดับการคั่วที่ดึงรสชาติเฉพาะตัวออกมาอย่างสมบูรณ์แบบ', 'Carefully selected roast profiles designed to reveal the coffee’s distinct character.'],
  'SIGNATURE BESTSELLER': ['ซิกเนเจอร์ขายดี', 'SIGNATURE BESTSELLER'],
  'DARK': ['คั่วเข้ม', 'DARK'],
  'MEDIUM': ['คั่วกลาง', 'MEDIUM'],
  'LIGHT': ['คั่วอ่อน', 'LIGHT'],
  'PROFILE 01': ['โปรไฟล์ 01', 'PROFILE 01'],
  'PROFILE 03': ['โปรไฟล์ 03', 'PROFILE 03'],
  'TATO COFFEE': ['TATO COFFEE', 'TATO COFFEE'],
  'Doi Wiang 100% Arabica': ['อาราบิก้า 100% จากดอยเวียง', 'Doi Wiang 100% Arabica'],
  'YOUR SELECTION': ['รายการที่เลือก', 'YOUR SELECTION'],
  'ตะกร้า': ['ตะกร้า', 'CART'],
  'SINGLE ORIGIN • 1,250M': ['ซิงเกิลออริจิน • 1,250M', 'SINGLE ORIGIN • 1,250M'],
  'Roast Profile': ['ระดับการคั่ว', 'Roast Profile'],
  'เลือกระดับคั่ว': ['เลือกระดับคั่ว', 'Select Roast'],
  'Grind': ['การบด', 'Grind'],
  'บดกาแฟ:': ['บดกาแฟ:', 'Grind:'],
  'จำนวน (KG):': ['จำนวน (กก.):', 'Quantity (KG):'],
  'HARVEST ASSURANCE': ['รับรองการเก็บเกี่ยว', 'HARVEST ASSURANCE'],
  'ยอดรวมเมล็ดกาแฟ:': ['ยอดรวมเมล็ดกาแฟ:', 'Coffee subtotal:'],
  'ค่าจัดส่งทั่วไทย:': ['ค่าจัดส่งทั่วไทย:', 'Nationwide shipping:'],
  'ยอดชำระสุทธิ:': ['ยอดชำระสุทธิ:', 'Total due:'],
  'ดำเนินการสั่งซื้อ / CHECKOUT': ['ดำเนินการสั่งซื้อ', 'CHECKOUT'],
  'CHECKOUT': ['ชำระเงิน', 'CHECKOUT'],
  'FREE (ฟรี)': ['ฟรี', 'FREE'],
  'FREE': ['ฟรี', 'FREE'],
  'PRODUCT VIEW': ['ดูสินค้า', 'PRODUCT VIEW'],
  'Base Investment': ['ราคาต่อกิโลกรัม', 'Base Investment'],
  'ราคาต่อกิโลกรัม': ['ราคาต่อกิโลกรัม', 'Price per kilogram'],
  'รวมภาษีมูลค่าเพิ่มแล้ว · จัดส่งฟรีเมื่อสั่งซื้อ 2 กก. ขึ้นไป': ['รวมภาษีมูลค่าเพิ่มแล้ว · จัดส่งฟรีเมื่อสั่งซื้อ 2 กก. ขึ้นไป', 'VAT included · Free shipping on orders of 2 KG or more'],
  'ROAST PROFILE': ['ระดับการคั่ว', 'ROAST PROFILE'],
  'เลือกระดับการคั่ว': ['เลือกระดับการคั่ว', 'Select Roast Profile'],
  'GRIND SIZE': ['ขนาดการบด', 'GRIND SIZE'],
  'ขนาดการบด': ['ขนาดการบด', 'Grind Size'],
  'CUSTOMER & DELIVERY SPECIFICATION': ['ข้อมูลผู้สั่งซื้อและจัดส่ง', 'CUSTOMER & DELIVERY SPECIFICATION'],
  'ข้อมูลผู้สั่งซื้อ': ['ข้อมูลผู้สั่งซื้อ', 'CUSTOMER INFORMATION'],
  'Full Name': ['ชื่อ-นามสกุล', 'Full Name'],
  'ชื่อ-นามสกุล': ['ชื่อ-นามสกุล', 'Full Name'],
  'Email Address': ['อีเมล', 'Email Address'],
  'อีเมล': ['อีเมล', 'Email Address'],
  'Phone Number': ['เบอร์โทรศัพท์', 'Phone Number'],
  'เบอร์โทรศัพท์': ['เบอร์โทรศัพท์', 'Phone Number'],
  'Shipping Address': ['ที่อยู่จัดส่ง', 'Shipping Address'],
  'ที่อยู่จัดส่ง': ['ที่อยู่จัดส่ง', 'Shipping Address'],
  'Note to Roaster': ['ความประสงค์เพิ่มเติม', 'Note to Roaster'],
  'ความประสงค์เพิ่มเติม (ถ้ามี)': ['ความประสงค์เพิ่มเติม (ถ้ามี)', 'Additional note (optional)'],
  'Payment Method': ['วิธีการชำระเงิน', 'Payment Method'],
  'วิธีการชำระเงิน': ['วิธีการชำระเงิน', 'Payment Method'],
  'เก็บเงินปลายทาง (COD)': ['เก็บเงินปลายทาง (COD)', 'Cash on Delivery (COD)'],
  'บัตรเครดิต / เดบิต': ['บัตรเครดิต / เดบิต', 'Credit / Debit Card'],
  'Quantity': ['จำนวน', 'Quantity'],
  'จำนวนกิโลกรัม (1 KG = 1 Pouch)': ['จำนวนกิโลกรัม (1 กก. = 1 ถุง)', 'Quantity (1 KG = 1 Pouch)'],
  'Subtotal': ['ยอดรวม', 'Subtotal'],
  'Shipping': ['ค่าจัดส่ง', 'Shipping'],
  'Total': ['ยอดรวมสุทธิ', 'Total'],
  'Total Amount:': ['ยอดรวมทั้งหมด:', 'Total Amount:'],
  'ORDER TATO · สั่งซื้อ TATO': ['สั่งซื้อ TATO', 'ORDER TATO'],
  'สั่งซื้อ TATO': ['สั่งซื้อ TATO', 'ORDER TATO'],
  '🔒 ชำระเงินปลายทาง หรือรับลิงก์ชำระผ่านพร้อมเพย์ทาง SMS / อีเมลยืนยัน': ['🔒 ชำระเงินปลายทาง หรือรับลิงก์ชำระผ่านพร้อมเพย์ทาง SMS / อีเมลยืนยัน', '🔒 Pay cash on delivery or receive a PromptPay payment link by SMS / email.'],
  'ขอบคุณสำหรับคำสั่งซื้อ TATO Coffee': ['ขอบคุณสำหรับคำสั่งซื้อ TATO Coffee', 'Thank you for your TATO Coffee order'],
  'เมล็ดกาแฟของคุณจะถูกคั่วสดใหม่': ['เมล็ดกาแฟของคุณจะถูกคั่วสดใหม่', 'Your coffee will be freshly roasted'],
  'RECIPIENT': ['ผู้รับ', 'RECIPIENT'],
  'ผู้รับ': ['ผู้รับ', 'RECIPIENT'],
  'PHONE': ['เบอร์โทร', 'PHONE'],
  'ROAST PROFILE / ระดับคั่ว': ['ระดับคั่ว', 'ROAST PROFILE'],
  'GRIND / การบด': ['การบด', 'GRIND'],
  'QUANTITY / ปริมาณ': ['ปริมาณ', 'QUANTITY'],
  'PROMPTPAY QR PAYMENT (สแกนชำระเงิน)': ['ชำระผ่าน QR พร้อมเพย์', 'PROMPTPAY QR PAYMENT'],
  'ดูใบเสร็จและสถานะการคั่ว / VIEW ORDER DETAILS': ['ดูใบเสร็จและสถานะการคั่ว', 'VIEW ORDER DETAILS'],
  'สั่งซื้อเพิ่มเติม / PLACE ANOTHER ORDER': ['สั่งซื้อเพิ่มเติม', 'PLACE ANOTHER ORDER'],
  'ESTATE ORDER ARCHIVE / ประวัติคำสั่งซื้อ': ['ประวัติคำสั่งซื้อจากแหล่งปลูก', 'ESTATE ORDER ARCHIVE'],
  'รายการคำสั่งซื้อเมล็ดกาแฟ TATO Coffee จากไร่ดอยเวียง': ['รายการคำสั่งซื้อเมล็ดกาแฟ TATO Coffee จากไร่ดอยเวียง', 'TATO Coffee orders from Doi Wiang estate'],
  'ยังไม่มีคำสั่งซื้อในระบบ': ['ยังไม่มีคำสั่งซื้อในระบบ', 'No orders yet'],
  'เลือกคั่วที่ชอบและสั่งซื้อเมล็ดกาแฟสดใหม่เพื่อเริ่มสะสมประวัติการสกัดของคุณ': ['เลือกคั่วที่ชอบและสั่งซื้อเมล็ดกาแฟสดใหม่เพื่อเริ่มสะสมประวัติการสกัดของคุณ', 'Choose your roast and order freshly roasted coffee to start your brew history.'],
  'รายละเอียด': ['รายละเอียด', 'DETAILS'],
  'ปิดหน้าต่าง / CLOSE': ['ปิดหน้าต่าง', 'CLOSE'],
  'TATO COFFEE ESTATE DISPATCH': ['การจัดส่งกาแฟจากแหล่งปลูก TATO', 'TATO COFFEE ESTATE DISPATCH'],
  'STATUS PIPELINE / สถานะการจัดเตรียม': ['สถานะการจัดเตรียม', 'STATUS PIPELINE'],
  'Queued': ['รอคิว', 'Queued'],
  'Roasting': ['กำลังคั่ว', 'Roasting'],
  'Degassing': ['พักคายแก๊ส', 'Degassing'],
  'Dispatched': ['จัดส่งแล้ว', 'Dispatched'],
  'Origin & Terroir:': ['แหล่งกำเนิดและสภาพพื้นที่:', 'Origin & Terroir:'],
  'Varietal:': ['สายพันธุ์:', 'Varietal:'],
  'Arabica 100% (Catimor & Typica)': ['อาราบิก้า 100% (Catimor & Typica)', 'Arabica 100% (Catimor & Typica)'],
  'Grind Specification:': ['รายละเอียดการบด:', 'Grind Specification:'],
  'Package Volume:': ['ปริมาณบรรจุ:', 'Package Volume:'],
  'Degassed Foil Pouch': ['ถุงฟอยล์พร้อมพักคายแก๊ส', 'Degassed Foil Pouch'],
  'Cash on Delivery (เก็บเงินปลายทาง)': ['เก็บเงินปลายทาง', 'Cash on Delivery'],
  'Credit/Debit Card': ['บัตรเครดิต/เดบิต', 'Credit/Debit Card'],
  'DELIVERY RECIPIENT / ข้อมูลการจัดส่ง': ['ข้อมูลการจัดส่ง', 'DELIVERY RECIPIENT'],
  'Note:': ['หมายเหตุ:', 'Note:'],
  'พิมพ์ใบคำสั่งซื้อ': ['พิมพ์ใบคำสั่งซื้อ', 'PRINT ORDER'],
  'ปิด / CLOSE': ['ปิด', 'CLOSE'],
  'TATO COFFEE': ['TATO COFFEE', 'TATO COFFEE'],
  'Single-Origin Arabica Estate nestled at Doi Wiang, Chiang Rai / Chiang Mai (1,250 MASL)': ['กาแฟอาราบิก้าซิงเกิลออริจินจากดอยเวียง เชียงราย / เชียงใหม่ (1,250 MASL)', 'Single-Origin Arabica Estate nestled at Doi Wiang, Chiang Rai / Chiang Mai (1,250 MASL)'],
  '1,250M ELEVATION': ['ความสูง 1,250M', '1,250M ELEVATION'],
  'PROVENANCE': ['แหล่งกำเนิด', 'PROVENANCE'],
  'Doi Wiang Terroir': ['สภาพพื้นที่ดอยเวียง', 'Doi Wiang Terroir'],
  'Micro-Lot Specialty Processing': ['กระบวนการพิเศษแบบไมโครล็อต', 'Micro-Lot Specialty Processing'],
  '100% Arabica Specialty': ['อาราบิก้าสเปเชียลตี้ 100%', '100% Arabica Specialty'],
  'Volcanic Micro-Climate': ['สภาพอากาศเฉพาะถิ่นจากพื้นที่ภูเขา', 'Volcanic Micro-Climate'],
  'HARVEST ASSURANCE': ['รับรองการเก็บเกี่ยว', 'HARVEST ASSURANCE'],
  'Fresh Small-Batch Roast': ['คั่วสดใหม่แบบ Small Batch', 'Fresh Small-Batch Roast'],
  'Nitrogen Purged Packaging': ['บรรจุภัณฑ์ไล่ไนโตรเจน', 'Nitrogen Purged Packaging'],
  'Direct Origin Trade': ['ซื้อขายตรงจากแหล่งกำเนิด', 'Direct Origin Trade'],
  'Traceable Lot Curves': ['ติดตามล็อตได้', 'Traceable Lot Curves'],
  'Arabica 100% • Single Origin • Doi Wiang 1,250m': ['อาราบิก้า 100% • ซิงเกิลออริจิน • ดอยเวียง 1,250 ม.', 'Arabica 100% • Single Origin • Doi Wiang 1,250m'],
  'Aerial panoramic view of misty mountain slopes and Arabica estate': ['ภาพมุมสูงของภูเขาที่ปกคลุมด้วยหมอกและแหล่งปลูกอาราบิก้า', 'Aerial panoramic view of misty mountain slopes and Arabica estate'],
  'Fresh deep crimson coffee cherries alongside artisanal roasted beans resting on matte dark slate': ['ผลเชอร์รี่กาแฟสีแดงเข้มสดใหม่เคียงคู่เมล็ดกาแฟคั่วบนแผ่นหินสีเข้ม', 'Fresh deep crimson coffee cherries alongside artisanal roasted beans resting on matte dark slate'],
  'Highland Cloud Mist & Shade-Grown Microclimate': ['หมอกภูเขาและสภาพอากาศเฉพาะถิ่นใต้ร่มเงา', 'Highland Cloud Mist & Shade-Grown Microclimate'],
  'Arabica 100%': ['อาราบิก้า 100%', 'Arabica 100%'],
  '100% Selective Hand Pluck': ['คัดเก็บด้วยมือ 100%', '100% Selective Hand Pluck'],
  'Elevated Tier African Mesh': ['ตากบนตะแกรงแอฟริกันแบบยกชั้น', 'Elevated Tier African Mesh'],
  '< 0.05% Specialty SCAA Graded': ['น้อยกว่า 0.05% ตามเกณฑ์ Specialty SCAA', '< 0.05% Specialty SCAA Graded'],
  'Dark roasted cocoa, toasted macadamia, bold velvety body with a dark chocolate liquor aftertaste.': ['โกโก้คั่วเข้ม แมคคาเดเมียคั่ว บอดี้แน่นนุ่ม และอาฟเตอร์เทสต์ดาร์กช็อกโกแลต', 'Dark roasted cocoa, toasted macadamia, bold velvety body with a dark chocolate liquor aftertaste.'],
  'Caramel sweetness, stone fruit balance, sweet brown sugar notes, and a remarkably smooth honey finish.': ['ความหวานคาราเมล สมดุลด้วยผลไม้เมล็ดแข็ง กลิ่นน้ำตาลทรายแดง และฟินิชน้ำผึ้งที่นุ่มลื่น', 'Caramel sweetness, stone fruit balance, sweet brown sugar notes, and a remarkably smooth honey finish.'],
  'White jasmine florals, crisp kaffir lime zest sweetness, bright lingering acidity, and clean tea-like translucence.': ['กลิ่นดอกมะลิขาว ความหวานสดใสของผิวมะกรูด กรดที่มีชีวิตชีวา และความใสสะอาดคล้ายชา', 'White jasmine florals, crisp kaffir lime zest sweetness, bright lingering acidity, and clean tea-like translucence.'],
  'Dark Cocoa': ['โกโก้เข้ม', 'Dark Cocoa'],
  'Roasted Macadamia': ['แมคคาเดเมียคั่ว', 'Roasted Macadamia'],
  'Heavy Body': ['บอดี้แน่น', 'Heavy Body'],
  'Caramel Cane': ['คาราเมลและน้ำตาลอ้อย', 'Caramel Cane'],
  'Ripe Stone Fruit': ['ผลไม้เมล็ดแข็งสุก', 'Ripe Stone Fruit'],
  'Wild Honey': ['น้ำผึ้งป่า', 'Wild Honey'],
  'Jasmine Flora': ['ดอกมะลิ', 'Jasmine Flora'],
  'Sweet Citrus': ['ซิตรัสหวาน', 'Sweet Citrus'],
  'Earl Grey Finish': ['ฟินิชเอิร์ลเกรย์', 'Earl Grey Finish'],
  'เข้ม • Bold & Viscous': ['เข้ม • หนักแน่นและนุ่มลึก', 'Bold & Viscous'],
  'กลาง • Sweet & Balanced': ['กลาง • หวานและสมดุล', 'Sweet & Balanced'],
  'อ่อน • Crisp & Aromatic': ['อ่อน • สดใสและหอมชัด', 'Crisp & Aromatic'],
  'Latte': ['ลาเต้', 'Latte'],
  'Americano': ['อเมริกาโน่', 'Americano'],
  'Espresso': ['เอสเพรสโซ่', 'Espresso'],
  'Moka Pot': ['โมก้าพอต', 'Moka Pot'],
  'Pour-Over': ['พัวร์โอเวอร์', 'Pour-Over'],
  'Drip': ['ดริป', 'Drip'],
  'Cold Brew': ['โคลด์บริว', 'Cold Brew'],
  'Whole Bean (เมล็ดกาแฟไม่บด)': ['เมล็ดกาแฟไม่บด', 'Whole Bean'],
  'Espresso / Moka Pot': ['เอสเพรสโซ่ / โมก้าพอต', 'Espresso / Moka Pot'],
  'Filter / Pour-Over / Drip': ['ฟิลเตอร์ / พัวร์โอเวอร์ / ดริป', 'Filter / Pour-Over / Drip'],
  'French Press': ['เฟรนช์เพรส', 'French Press'],
  'Cold Brew / แช่เย็น': ['โคลด์บริว / แช่เย็น', 'Cold Brew / Chilled'],
  'ดีที่สุดเพื่อคงความสดใหม่และกักเก็บกลิ่นหอม': ['ดีที่สุดเพื่อคงความสดใหม่และกักเก็บกลิ่นหอม', 'Best for preserving freshness and aroma.'],
  'บดละเอียด เหมาะสำหรับเครื่องชง Espresso และ Mokapot': ['บดละเอียด เหมาะสำหรับเครื่องชง Espresso และ Moka Pot', 'Fine grind for Espresso and Moka Pot.'],
  'บดปานกลาง เหมาะสำหรับดริป, V60, Chemex, Aeropress': ['บดปานกลาง เหมาะสำหรับดริป, V60, Chemex และ Aeropress', 'Medium grind for V60, Chemex, Aeropress and drip.'],
  'บดหยาบ สกัดกลิ่นหอมเข้มข้น ไม่เกิดตะกอนฝุ่น': ['บดหยาบเพื่อสกัดกลิ่นหอมเข้มข้นและลดตะกอน', 'Coarse grind for a rich extraction with minimal sediment.'],
  'บดหยาบพิเศษสำหรับการสกัดเย็น 12-24 ชั่วโมง': ['บดหยาบพิเศษสำหรับการสกัดเย็น 12–24 ชั่วโมง', 'Extra-coarse grind for 12–24 hour cold brew.'],
  'Origin / แหล่งปลูก': ['แหล่งปลูก', 'Origin'],
  'Elevation / ความสูง': ['ความสูง', 'Elevation'],
  'Variety / สายพันธุ์': ['สายพันธุ์', 'Variety'],
  'Harvest Method': ['วิธีเก็บเกี่ยว', 'Harvest Method'],
  'Processing': ['กระบวนการแปรรูป', 'Processing'],
  'Roast Schedule': ['ตารางการคั่ว', 'Roast Schedule'],
  'Fresh Roast ทุกออเดอร์ (คั่วตามคำสั่งซื้อ)': ['คั่วสดใหม่ทุกออเดอร์', 'Fresh Roast for every order'],
  'Anaerobic Washed & Raised Solar Beds': ['หมักแบบ Anaerobic Washed และตากบนแคร่ยกสูง', 'Anaerobic Washed & Raised Solar Beds'],
  'PRIMARY AROMA': ['กลิ่นหลัก', 'PRIMARY AROMA'],
  'Dark Brown Sugar & Hazelnut': ['น้ำตาลทรายแดงเข้มและฮาเซลนัท', 'Dark Brown Sugar & Hazelnut'],
  'ACIDITY & SWEETNESS': ['ความเปรี้ยวและความหวาน', 'ACIDITY & SWEETNESS'],
  'Ripe Plum & Citric Touch': ['พลัมสุกและสัมผัสซิตรัส', 'Ripe Plum & Citric Touch'],
  'FINISH & TEXTURE': ['ฟินิชและเนื้อสัมผัส', 'FINISH & TEXTURE'],
  'Velvety Cocoa Lingering': ['โกโก้นุ่มลึกติดปลายลิ้น', 'Velvety Cocoa Lingering'],
  'BREW METHOD': ['วิธีชง', 'BREW METHOD'],
  'Espresso & Hand Drip': ['เอสเพรสโซ่และดริปมือ', 'Espresso & Hand Drip'],
  'Fresh Roast': ['คั่วสดใหม่', 'Fresh Roast'],
  'Doi Wiang highland coffee plantation enveloped in morning sea of mist at sunrise': ['ไร่กาแฟดอยเวียงบนพื้นที่สูงท่ามกลางทะเลหมอกยามเช้าในช่วงพระอาทิตย์ขึ้น', 'Doi Wiang highland coffee plantation enveloped in morning sea of mist at sunrise'],
  'TATO Coffee Brandmark': ['ตราสัญลักษณ์ TATO Coffee', 'TATO Coffee Brandmark'],
  'TATO Coffee': ['TATO Coffee', 'TATO Coffee'],
  'TATO Coffee orders from Doi Wiang estate': ['คำสั่งซื้อ TATO Coffee จากไร่ดอยเวียง', 'TATO Coffee orders from Doi Wiang estate'],
  'DETAILS': ['รายละเอียด', 'DETAILS'],
  'PRINT ORDER': ['พิมพ์คำสั่งซื้อ', 'PRINT ORDER'],
  'Nationwide shipping:': ['จัดส่งทั่วประเทศ:', 'Nationwide shipping:'],
  'Coffee subtotal:': ['ยอดรวมกาแฟ:', 'Coffee subtotal:'],
  'Total due:': ['ยอดชำระสุทธิ:', 'Total due:'],
  'Price per kilogram': ['ราคาต่อกิโลกรัม', 'Price per kilogram'],
  'Select Roast Profile': ['เลือกระดับการคั่ว', 'Select Roast Profile'],
  'Additional note (optional)': ['หมายเหตุเพิ่มเติม (ถ้ามี)', 'Additional note (optional)'],
  'Cash on Delivery (COD)': ['เก็บเงินปลายทาง (COD)', 'Cash on Delivery (COD)'],
  'Credit / Debit Card': ['บัตรเครดิต / เดบิต', 'Credit / Debit Card'],
  'Thank you for your TATO Coffee order': ['ขอบคุณสำหรับคำสั่งซื้อ TATO Coffee', 'Thank you for your TATO Coffee order'],
  'Your coffee will be freshly roasted': ['กาแฟของคุณจะถูกคั่วสดใหม่', 'Your coffee will be freshly roasted'],
  'No orders yet': ['ยังไม่มีคำสั่งซื้อในระบบ', 'No orders yet'],
  'Choose your roast and order freshly roasted coffee to start your brew history.': ['เลือกระดับการคั่วที่ชอบและสั่งกาแฟคั่วสดเพื่อเริ่มบันทึกประวัติการชงของคุณ', 'Choose your roast and order freshly roasted coffee to start your brew history.'],
  'PRINT ORDER': ['พิมพ์คำสั่งซื้อ', 'PRINT ORDER'],

  'The distinct diurnal temperature shift at 1,250 MASL concentrates organic sugars deep within each coffee bean.': ['ความแตกต่างของอุณหภูมิระหว่างกลางวันและกลางคืนที่ระดับ 1,250 MASL ช่วยสะสมน้ำตาลธรรมชาติไว้ภายในเมล็ดกาแฟ', 'The distinct diurnal temperature shift at 1,250 MASL concentrates organic sugars deep within each coffee bean.'],
  'Every bean tells the history of Doi Wiang’s soil. Before entering the roaster drum, our cherries undergo rigorous floating separation, optical sorting, and extended slow fermentation in controlled temperature tanks.': ['ทุกเมล็ดสะท้อนเรื่องราวของผืนดินดอยเวียง ก่อนเข้าสู่ถังคั่ว ผลกาแฟผ่านการแยกลอย คัดด้วยระบบแสง และหมักช้าในถังควบคุมอุณหภูมิ', 'Every bean tells the history of Doi Wiang’s soil. Before entering the roaster drum, our cherries undergo rigorous floating separation, optical sorting, and extended slow fermentation in controlled temperature tanks.'],
  '48-hour oxygen-free tank fermentation followed by double mountain wash for supreme clarity.': ['หมักในถังไร้ออกซิเจน 48 ชั่วโมง แล้วล้างด้วยน้ำภูเขาสองขั้นตอนเพื่อความใสสะอาดของรสชาติ', '48-hour oxygen-free tank fermentation followed by double mountain wash for supreme clarity.'],
  'Sun-dried slowly across 18 days on elevated bamboo mesh to stabilize moisture at exactly 10.5%.': ['ตากแดดช้า ๆ 18 วันบนตาข่ายไม้ไผ่ยกสูง เพื่อคงความชื้นไว้ที่ 10.5%', 'Sun-dried slowly across 18 days on elevated bamboo mesh to stabilize moisture at exactly 10.5%.'],
  'Pouch': ['ถุง', 'Pouch'],
  'KG': ['กก.', 'KG'],
  'THB': ['บาท', 'THB'],
};

const textCache = new WeakMap<Text, string>();
const attrCache = new WeakMap<Element, Map<string, string>>();
let applying = false;

function splitBilingual(value: string, language: Language): string | null {
  const parts = value.split(/\s+\/\s+/);
  if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
    return language === 'th' ? parts[0].trim() : parts[1].trim();
  }
  return null;
}

function translateText(value: string, language: Language): string {
  const trimmed = value.trim();
  if (!trimmed) return value;

  const bilingual = splitBilingual(trimmed, language);
  if (bilingual !== null) {
    const lead = value.slice(0, value.indexOf(trimmed));
    const tail = value.slice(value.indexOf(trimmed) + trimmed.length);
    return lead + bilingual + tail;
  }

  const pair = DICT[trimmed];
  if (pair) {
    const translated = language === 'th' ? pair[0] : pair[1];
    const lead = value.slice(0, value.indexOf(trimmed));
    const tail = value.slice(value.indexOf(trimmed) + trimmed.length);
    return lead + translated + tail;
  }

  return value;
}

function translateElementAttributes(element: Element, language: Language) {
  const attrs = ['placeholder', 'title', 'aria-label', 'alt'];
  let cache = attrCache.get(element);
  if (!cache) {
    cache = new Map();
    attrCache.set(element, cache);
  }

  for (const attr of attrs) {
    const current = element.getAttribute(attr);
    if (current === null) continue;
    const original = cache.get(attr) ?? current;
    cache.set(attr, original);
    const translated = translateText(original, language);
    if (translated !== current) element.setAttribute(attr, translated);
  }
}

function translateDocument(language: Language) {
  if (applying) return;
  applying = true;

  try {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) nodes.push(node as Text);

    for (const textNode of nodes) {
      if (textNode.parentElement?.closest('[data-tato-no-translate]')) continue;
      const original = textCache.get(textNode) ?? textNode.nodeValue ?? '';
      textCache.set(textNode, original);
      const translated = translateText(original, language);
      if (translated !== textNode.nodeValue) textNode.nodeValue = translated;
    }

    const elements = document.body.querySelectorAll('[placeholder],[title],[aria-label],[alt]');
    elements.forEach((el) => translateElementAttributes(el, language));
  } finally {
    applying = false;
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'th';
    return localStorage.getItem('tato_language') === 'en' ? 'en' : 'th';
  });

  useEffect(() => {
    document.documentElement.lang = language;
    translateDocument(language);

    const observer = new MutationObserver(() => {
      if (!applying) translateDocument(language);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [language]);

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    localStorage.setItem('tato_language', next);
  };

  const value = useMemo(() => ({ language, setLanguage }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}

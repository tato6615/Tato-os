export type PageView = 'discover' | 'origin' | 'roasts' | 'product';

export type RoastType = 'dark' | 'medium' | 'light';

export type GrindType = 
  | 'whole_bean'
  | 'espresso'
  | 'filter'
  | 'french_press'
  | 'cold_brew';

export interface RoastProfile {
  id: RoastType;
  name: string;
  nameThai: string;
  subtitle: string;
  description: string;
  notes: string[];
  intensity: number;
  intensityMax: number;
  intensityDisplay: string;
  colorHex: string;
  barColor: string;
  isBestseller?: boolean;
}

export interface CustomerDetails {
  name: string;
  email: string;
  phone: string;
  address: string;
  note?: string;
  paymentMethod: 'promptpay' | 'cod' | 'credit_card';
}

export interface OrderItem {
  id: string;
  roast: RoastType;
  grind: GrindType;
  quantityKg: number;
  unitPrice: number;
  subtotal: number;
  shipping: number;
  total: number;
  customer: CustomerDetails;
  timestamp: string;
  orderNumber: string;
  status: 'Roast Queued' | 'Roasting' | 'Degassing & Packing' | 'Dispatched';
}

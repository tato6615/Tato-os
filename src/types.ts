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
  postalCode: string;
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
  serverId?: string;
  discount?: number;
  discountCode?: string;
  expectedTotal?: number;
  requestId?: string;
  consent?: boolean;
  turnstileToken?: string;
  statusUrl?: string;
  lineOa?: string;
  payment?: PaymentInstructions;
}

export interface PaymentInstructions { method?: string; bank_name?: string; account_name?: string; account_number?: string; promptpay?: string; note?: string; }
export interface CheckoutResult { ok: boolean; error?: string; fields?: Record<string, string>; order?: OrderItem; }

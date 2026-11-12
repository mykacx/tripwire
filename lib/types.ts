// Shared data model for Tripwire orders.

export type ItemCategory = "normal" | "gift_card" | "electronics";

export interface Product {
  sku: string;
  name: string;
  price: number; // USD
  category: ItemCategory;
  blurb: string;
}

export interface OrderItem {
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  category: ItemCategory;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  countryCode: string; // ISO 3166-1 alpha-2
}

export interface Customer {
  name: string;
  email: string;
  phone: string;
}

export type OrderStatus = "needs_review" | "approved" | "voided";

export interface PayPalInfo {
  orderId?: string;
  orderStatus?: string;
  authorizationId?: string;
  authorizationStatus?: string;
  authorizationExpiresAt?: string; // PayPal's expiration_time (29-day validity)
  honorPeriodEndsAt?: string; // 3-day honor period, after which capture may fail
  payerId?: string;
  payerEmail?: string;
  payerName?: string;
  payerCountry?: string;
  captureId?: string;
  captureStatus?: string;
  voidStatus?: string;
  debugId?: string;
  lastError?: string;
}

export type EventType = "authorized" | "ai_reviewed" | "approved" | "voided" | "error" | "note";

export interface OrderEvent {
  at: string;
  type: EventType;
  actor: "system" | "ai" | "human" | "paypal";
  message: string;
}

export interface Order {
  id: string;
  demo: boolean;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  customer: Customer;
  shipping: Address;
  note?: string;
  items: OrderItem[];
  total: number;
  currency: "USD";
  paypal: PayPalInfo;
  events: OrderEvent[];
}

export interface CheckoutForm {
  customer: Customer;
  shipping: Address;
  note?: string;
  items: { sku: string; quantity: number }[];
}

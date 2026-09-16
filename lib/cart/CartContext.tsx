"use client";

import { createContext, useContext, useEffect, useReducer, type ReactNode } from "react";
import type { CartItem } from "./types";

const STORAGE_KEY = "kvitkovyi-cart";

type CartState = { items: CartItem[] };

type CartAction =
  | { type: "ADD_ITEM"; item: Omit<CartItem, "quantity">; quantity: number }
  | { type: "REMOVE_ITEM"; productId: string }
  | { type: "SET_QUANTITY"; productId: string; quantity: number }
  | { type: "CLEAR" }
  | { type: "LOAD"; items: CartItem[] };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "LOAD":
      return { items: action.items };
    case "ADD_ITEM": {
      const existing = state.items.find((i) => i.productId === action.item.productId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === action.item.productId
              ? { ...i, quantity: i.quantity + action.quantity }
              : i
          ),
        };
      }
      return { items: [...state.items, { ...action.item, quantity: action.quantity }] };
    }
    case "REMOVE_ITEM":
      return { items: state.items.filter((i) => i.productId !== action.productId) };
    case "SET_QUANTITY":
      if (action.quantity <= 0) {
        return { items: state.items.filter((i) => i.productId !== action.productId) };
      }
      return {
        items: state.items.map((i) =>
          i.productId === action.productId ? { ...i, quantity: action.quantity } : i
        ),
      };
    case "CLEAR":
      return { items: [] };
    default:
      return state;
  }
}

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  totalCents: number;
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) dispatch({ type: "LOAD", items: JSON.parse(raw) });
    } catch {
      // ignore malformed/inaccessible storage
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    } catch {
      // ignore storage write failures (private mode, quota, etc.)
    }
  }, [state.items]);

  const itemCount = state.items.reduce((sum, i) => sum + i.quantity, 0);
  const totalCents = state.items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);

  const value: CartContextValue = {
    items: state.items,
    itemCount,
    totalCents,
    addItem: (item, quantity = 1) => dispatch({ type: "ADD_ITEM", item, quantity }),
    removeItem: (productId) => dispatch({ type: "REMOVE_ITEM", productId }),
    setQuantity: (productId, quantity) => dispatch({ type: "SET_QUANTITY", productId, quantity }),
    clear: () => dispatch({ type: "CLEAR" }),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}

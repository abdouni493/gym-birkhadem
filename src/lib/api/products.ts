import { supabase } from '@/lib/supabase';

export interface Brand { id: string; name: string }
export interface Category { id: string; name: string }

export interface Product {
  id: string;
  barcode: string | null;
  name: string;
  category_id: string | null;
  brand_id: string | null;
  supplier_id: string | null;
  real_price: number;
  sell_price: number;
  initial_quantity: number;
  current_stock: number;
  sold: number;
  expiry_date: string | null;
  description: string | null;
  min_stock_level: number;
  location: string | null;
  image_url: string | null;
  brands?: Brand | null;
  categories?: Category | null;
}

export type ProductStatus = 'in_stock' | 'low_stock' | 'critical' | 'out_of_stock';

/** Client mirror of the SQL product_status() function. */
export function productStatus(currentStock: number, minStockLevel: number): ProductStatus {
  const min = Math.max(minStockLevel || 5, 1);
  if (currentStock <= 0) return 'out_of_stock';
  if (currentStock <= min) return 'critical';
  if (currentStock <= min * 2) return 'low_stock';
  return 'in_stock';
}

const SELECT = `
  id, barcode, name, category_id, brand_id, supplier_id, real_price, sell_price,
  initial_quantity, current_stock, sold, expiry_date, description, min_stock_level,
  location, image_url,
  brands ( id, name ), categories ( id, name )
`;

export async function listProducts(): Promise<Product[]> {
  const { data, error } = await supabase.from('products').select(SELECT).order('name');
  if (error) throw error;
  return (data ?? []) as unknown as Product[];
}

export interface ProductInput {
  name: string;
  barcode?: string | null;
  category_id?: string | null;
  brand_id?: string | null;
  supplier_id?: string | null;
  real_price?: number;
  sell_price?: number;
  initial_quantity?: number;
  current_stock?: number;
  min_stock_level?: number;
  expiry_date?: string | null;
  description?: string | null;
  image_url?: string | null;
}

const clean = (input: ProductInput) => ({
  ...input,
  barcode: input.barcode?.trim() || null,
  description: input.description?.trim() || null,
  expiry_date: input.expiry_date || null,
});

export async function createProduct(input: ProductInput): Promise<void> {
  const { error } = await supabase.from('products').insert(clean(input));
  if (error) throw error;
}

export async function updateProduct(id: string, input: ProductInput): Promise<void> {
  const { error } = await supabase.from('products').update(clean(input)).eq('id', id);
  if (error) throw error;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

// ---- Brands / categories --------------------------------------------------

export async function listBrands(): Promise<Brand[]> {
  const { data, error } = await supabase.from('brands').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Brand[];
}

export async function createBrand(name: string): Promise<Brand> {
  const { data, error } = await supabase.from('brands').insert({ name: name.trim() }).select().single();
  if (error) throw error;
  return data as Brand;
}

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from('categories').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function createCategory(name: string): Promise<Category> {
  const { data, error } = await supabase.from('categories').insert({ name: name.trim() }).select().single();
  if (error) throw error;
  return data as Category;
}

const INITIAL_PRODUCTS = [
  {
    sku: "8901030753007",
    name: "Amul Butter 500g",
    category: "Dairy",
    hsn: "0405",
    costPrice: 240.00,
    sellingPrice: 275.00,
    gstSlab: 12,
    stock: 45,
    reorderLevel: 10,
    unit: "pcs",
    discountPercent: 0
  },
  {
    sku: "8901499009132",
    name: "Tata Salt 1kg",
    category: "Pantry",
    hsn: "2501",
    costPrice: 22.00,
    sellingPrice: 28.00,
    gstSlab: 0,
    stock: 95,
    reorderLevel: 15,
    unit: "pcs",
    discountPercent: 0
  },
  {
    sku: "8901725181229",
    name: "Aashirvaad Shudh Chakki Atta 5kg",
    category: "Pantry",
    hsn: "1101",
    costPrice: 250.00,
    sellingPrice: 290.00,
    gstSlab: 5,
    stock: 28,
    reorderLevel: 8,
    unit: "pcs",
    discountPercent: 0
  },
  {
    sku: "8901058860015",
    name: "Britannia Marie Gold 250g",
    category: "Snacks",
    hsn: "1905",
    costPrice: 32.00,
    sellingPrice: 40.00,
    gstSlab: 18,
    stock: 8,
    reorderLevel: 15,
    unit: "pcs",
    discountPercent: 5
  },
  {
    sku: "1001",
    name: "Fresh Onion (Pyaz)",
    category: "Produce",
    hsn: "0703",
    costPrice: 26.00,
    sellingPrice: 35.00,
    gstSlab: 0,
    stock: 120,
    reorderLevel: 25,
    unit: "kg",
    discountPercent: 0
  },
  {
    sku: "1002",
    name: "Fresh Potato (Aloo)",
    category: "Produce",
    hsn: "0701",
    costPrice: 18.00,
    sellingPrice: 25.00,
    gstSlab: 0,
    stock: 145,
    reorderLevel: 30,
    unit: "kg",
    discountPercent: 0
  },
  {
    sku: "8901765111101",
    name: "Red Bull Energy Drink 250ml",
    category: "Beverages",
    hsn: "2202",
    costPrice: 100.00,
    sellingPrice: 125.00,
    gstSlab: 28,
    stock: 55,
    reorderLevel: 12,
    unit: "pcs",
    discountPercent: 0
  },
  {
    sku: "8902519000324",
    name: "Tata Tea Premium 1kg",
    category: "Pantry",
    hsn: "0902",
    costPrice: 355.00,
    sellingPrice: 420.00,
    gstSlab: 5,
    stock: 18,
    reorderLevel: 5,
    unit: "pcs",
    discountPercent: 10
  },
  {
    sku: "8901030818294",
    name: "Surf Excel Easy Wash 1kg",
    category: "Household",
    hsn: "3402",
    costPrice: 110.00,
    sellingPrice: 140.00,
    gstSlab: 18,
    stock: 3,
    reorderLevel: 8,
    unit: "pcs",
    discountPercent: 0
  },
  {
    sku: "8901396600029",
    name: "Maggi 2-Min Masala Noodles 70g",
    category: "Snacks",
    hsn: "1902",
    costPrice: 11.20,
    sellingPrice: 14.00,
    gstSlab: 18,
    stock: 180,
    reorderLevel: 35,
    unit: "pcs",
    discountPercent: 0
  },
  {
    sku: "8901262010012",
    name: "Dettol Liquid Handwash Refill 175ml",
    category: "Household",
    hsn: "3401",
    costPrice: 75.00,
    sellingPrice: 99.00,
    gstSlab: 18,
    stock: 22,
    reorderLevel: 6,
    unit: "pcs",
    discountPercent: 0
  },
  {
    sku: "8901719124010",
    name: "Fortune Mustard Oil 1L",
    category: "Pantry",
    hsn: "1514",
    costPrice: 145.00,
    sellingPrice: 175.00,
    gstSlab: 5,
    stock: 30,
    reorderLevel: 10,
    unit: "pcs",
    discountPercent: 0
  }
];

const getDateDaysAgo = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
};

const INITIAL_TRANSACTIONS = [];


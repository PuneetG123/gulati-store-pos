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

const INITIAL_TRANSACTIONS = [
  {
    id: "TXN-902148",
    date: getDateDaysAgo(6) + "T10:15:30Z",
    customerName: "Rahul Sharma",
    customerPhone: "9876543210",
    items: [
      { sku: "8901725181229", name: "Aashirvaad Shudh Chakki Atta 5kg", sellingPrice: 290.00, quantity: 1, gstSlab: 5, hsn: "1101" },
      { sku: "8901499009132", name: "Tata Salt 1kg", sellingPrice: 28.00, quantity: 2, gstSlab: 0, hsn: "2501" },
      { sku: "1001", name: "Fresh Onion (Pyaz)", sellingPrice: 35.00, quantity: 2, gstSlab: 0, hsn: "0703" }
    ],
    subtotal: 416.00,
    discountType: "flat",
    discountValue: 20.00,
    discountAmount: 20.00,
    gstAmount: 13.81,
    totalPayable: 396.00,
    paymentMethod: "UPI"
  },
  {
    id: "TXN-902149",
    date: getDateDaysAgo(5) + "T14:30:22Z",
    customerName: "Priya Patel",
    customerPhone: "9911223344",
    items: [
      { sku: "8901030753007", name: "Amul Butter 500g", sellingPrice: 275.00, quantity: 1, gstSlab: 12, hsn: "0405" },
      { sku: "8901058860015", name: "Britannia Marie Gold 250g", sellingPrice: 40.00, quantity: 3, gstSlab: 18, hsn: "1905" },
      { sku: "8901765111101", name: "Red Bull Energy Drink 250ml", sellingPrice: 125.00, quantity: 2, gstSlab: 28, hsn: "2202" }
    ],
    subtotal: 645.00,
    discountType: "percentage",
    discountValue: 5,
    discountAmount: 32.25,
    gstAmount: 93.45,
    totalPayable: 706.20,
    paymentMethod: "Card"
  },
  {
    id: "TXN-902150",
    date: getDateDaysAgo(4) + "T18:45:10Z",
    customerName: "Aman Verma",
    customerPhone: "9812345678",
    items: [
      { sku: "8901719124010", name: "Fortune Mustard Oil 1L", sellingPrice: 175.00, quantity: 2, gstSlab: 5, hsn: "1514" },
      { sku: "8901396600029", name: "Maggi 2-Min Masala Noodles 70g", sellingPrice: 14.00, quantity: 10, gstSlab: 18, hsn: "1902" }
    ],
    subtotal: 490.00,
    discountType: "flat",
    discountValue: 0.00,
    discountAmount: 0.00,
    gstAmount: 29.70,
    totalPayable: 519.70,
    paymentMethod: "Cash"
  },
  {
    id: "TXN-902151",
    date: getDateDaysAgo(3) + "T11:20:00Z",
    customerName: "Sanjay Gupta",
    customerPhone: "9009009001",
    items: [
      { sku: "8902519000324", name: "Tata Tea Premium 1kg", sellingPrice: 420.00, quantity: 1, gstSlab: 5, hsn: "0902" },
      { sku: "8901030753007", name: "Amul Butter 500g", sellingPrice: 275.00, quantity: 2, gstSlab: 12, hsn: "0405" }
    ],
    subtotal: 970.00,
    discountType: "percentage",
    discountValue: 10,
    discountAmount: 97.00,
    gstAmount: 70.36,
    totalPayable: 943.36,
    paymentMethod: "UPI"
  },
  {
    id: "TXN-902152",
    date: getDateDaysAgo(2) + "T16:10:45Z",
    customerName: "Meena Joshi",
    customerPhone: "9312341234",
    items: [
      { sku: "1001", name: "Fresh Onion (Pyaz)", sellingPrice: 35.00, quantity: 4, gstSlab: 0, hsn: "0703" },
      { sku: "1002", name: "Fresh Potato (Aloo)", sellingPrice: 25.00, quantity: 3, gstSlab: 0, hsn: "0701" },
      { sku: "8901262010012", name: "Dettol Liquid Handwash Refill 175ml", sellingPrice: 99.00, quantity: 2, gstSlab: 18, hsn: "3401" }
    ],
    subtotal: 413.00,
    discountType: "flat",
    discountValue: 15.00,
    discountAmount: 15.00,
    gstAmount: 28.18,
    totalPayable: 426.18,
    paymentMethod: "Cash"
  },
  {
    id: "TXN-902153",
    date: getDateDaysAgo(1) + "T12:05:12Z",
    customerName: "Vikram Malhotra",
    customerPhone: "9445566778",
    items: [
      { sku: "8901765111101", name: "Red Bull Energy Drink 250ml", sellingPrice: 125.00, quantity: 4, gstSlab: 28, hsn: "2202" },
      { sku: "8901058860015", name: "Britannia Marie Gold 250g", sellingPrice: 40.00, quantity: 5, gstSlab: 18, hsn: "1905" }
    ],
    subtotal: 700.00,
    discountType: "percentage",
    discountValue: 8,
    discountAmount: 56.00,
    gstAmount: 126.85,
    totalPayable: 770.85,
    paymentMethod: "UPI"
  },
  {
    id: "TXN-902154",
    date: getDateDaysAgo(0) + "T09:40:00Z",
    customerName: "Anita Desai",
    customerPhone: "9555544444",
    items: [
      { sku: "8901725181229", name: "Aashirvaad Shudh Chakki Atta 5kg", sellingPrice: 290.00, quantity: 2, gstSlab: 5, hsn: "1101" },
      { sku: "8901030818294", name: "Surf Excel Easy Wash 1kg", sellingPrice: 140.00, quantity: 1, gstSlab: 18, hsn: "3402" },
      { sku: "8901396600029", name: "Maggi 2-Min Masala Noodles 70g", sellingPrice: 14.00, quantity: 5, gstSlab: 18, hsn: "1902" }
    ],
    subtotal: 790.00,
    discountType: "flat",
    discountValue: 30.00,
    discountAmount: 30.00,
    gstAmount: 51.68,
    totalPayable: 811.68,
    paymentMethod: "UPI"
  }
];

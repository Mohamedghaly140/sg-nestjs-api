import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  OrderStatus,
  PaymentMethod,
  PrismaClient,
  ProductStatus,
  Role,
} from '../src/generated/prisma/client';

function discountedPrice(priceInPiasters: number, discountPercent: number) {
  const discountedPiasters = Math.round(
    priceInPiasters * (1 - discountPercent / 100),
  );

  return (discountedPiasters / 100).toFixed(2);
}

async function seed() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DIRECT_URL or DATABASE_URL must be set to seed the database',
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const admin = await prisma.user.upsert({
      where: { email: 'admin.seed@sgcouture.test' },
      update: {
        name: 'Nour El Din',
        phone: '+201000000001',
        role: Role.ADMIN,
        active: true,
      },
      create: {
        id: 'user_seed_admin',
        email: 'admin.seed@sgcouture.test',
        name: 'Nour El Din',
        phone: '+201000000001',
        role: Role.ADMIN,
      },
    });

    const customer = await prisma.user.upsert({
      where: { email: 'customer.seed@sgcouture.test' },
      update: {
        name: 'Mariam Hassan',
        phone: '+201000000002',
        role: Role.USER,
        active: true,
      },
      create: {
        id: 'user_seed_customer',
        email: 'customer.seed@sgcouture.test',
        name: 'Mariam Hassan',
        phone: '+201000000002',
        role: Role.USER,
      },
    });

    const customerAddress = await prisma.address.upsert({
      where: { id: 'seed_address_customer_home' },
      update: {
        alias: 'Home',
        country: 'Egypt',
        governorate: 'Cairo',
        city: 'Nasr City',
        area: 'District 7',
        phone: '+201000000002',
        addressLine1: '12 Mostafa El Nahas Street',
        details: 'Building 4, floor 3, apartment 8',
        postalCode: 11765,
        isDefault: true,
        userId: customer.id,
      },
      create: {
        id: 'seed_address_customer_home',
        alias: 'Home',
        country: 'Egypt',
        governorate: 'Cairo',
        city: 'Nasr City',
        area: 'District 7',
        phone: '+201000000002',
        addressLine1: '12 Mostafa El Nahas Street',
        details: 'Building 4, floor 3, apartment 8',
        postalCode: 11765,
        isDefault: true,
        userId: customer.id,
      },
    });

    const dresses = await prisma.category.upsert({
      where: { slug: 'dresses' },
      update: {
        name: 'Dresses',
        imageId: 'seed/categories/dresses',
        imageUrl: 'https://res.cloudinary.com/demo/image/upload/dresses.jpg',
      },
      create: {
        name: 'Dresses',
        slug: 'dresses',
        imageId: 'seed/categories/dresses',
        imageUrl: 'https://res.cloudinary.com/demo/image/upload/dresses.jpg',
      },
    });

    const separates = await prisma.category.upsert({
      where: { slug: 'separates' },
      update: {
        name: 'Separates',
        imageId: 'seed/categories/separates',
        imageUrl: 'https://res.cloudinary.com/demo/image/upload/separates.jpg',
      },
      create: {
        name: 'Separates',
        slug: 'separates',
        imageId: 'seed/categories/separates',
        imageUrl: 'https://res.cloudinary.com/demo/image/upload/separates.jpg',
      },
    });

    const eveningDresses = await prisma.subCategory.upsert({
      where: { slug: 'evening-dresses' },
      update: {
        name: 'Evening Dresses',
        categoryId: dresses.id,
      },
      create: {
        name: 'Evening Dresses',
        slug: 'evening-dresses',
        categoryId: dresses.id,
      },
    });

    const dayDresses = await prisma.subCategory.upsert({
      where: { slug: 'day-dresses' },
      update: {
        name: 'Day Dresses',
        categoryId: dresses.id,
      },
      create: {
        name: 'Day Dresses',
        slug: 'day-dresses',
        categoryId: dresses.id,
      },
    });

    const blouses = await prisma.subCategory.upsert({
      where: { slug: 'blouses' },
      update: {
        name: 'Blouses',
        categoryId: separates.id,
      },
      create: {
        name: 'Blouses',
        slug: 'blouses',
        categoryId: separates.id,
      },
    });

    const satinDressPrice = discountedPrice(240_000, 15);
    const satinDress = await prisma.product.upsert({
      where: { slug: 'satin-cowl-neck-dress' },
      update: {
        name: 'Satin Cowl-Neck Dress',
        description:
          'Floor-length satin evening dress with a softly draped neckline.',
        quantity: 12,
        sold: 0,
        price: '2400.00',
        discount: '15.00',
        priceAfterDiscount: satinDressPrice,
        sizes: ['S', 'M', 'L'],
        colors: ['Emerald', 'Black'],
        imageId: 'seed/products/satin-cowl-neck-dress/cover',
        imageUrl:
          'https://res.cloudinary.com/demo/image/upload/satin-cowl-neck-dress.jpg',
        ratingsAverage: '4.5',
        ratingsQuantity: 2,
        status: ProductStatus.ACTIVE,
        featured: true,
        categoryId: dresses.id,
      },
      create: {
        name: 'Satin Cowl-Neck Dress',
        slug: 'satin-cowl-neck-dress',
        description:
          'Floor-length satin evening dress with a softly draped neckline.',
        quantity: 12,
        sold: 0,
        price: '2400.00',
        discount: '15.00',
        priceAfterDiscount: satinDressPrice,
        sizes: ['S', 'M', 'L'],
        colors: ['Emerald', 'Black'],
        imageId: 'seed/products/satin-cowl-neck-dress/cover',
        imageUrl:
          'https://res.cloudinary.com/demo/image/upload/satin-cowl-neck-dress.jpg',
        ratingsAverage: '4.5',
        ratingsQuantity: 2,
        status: ProductStatus.ACTIVE,
        featured: true,
        categoryId: dresses.id,
      },
    });

    const linenBlousePrice = discountedPrice(135_000, 0);
    const linenBlouse = await prisma.product.upsert({
      where: { slug: 'linen-puff-sleeve-blouse' },
      update: {
        name: 'Linen Puff-Sleeve Blouse',
        description:
          'Lightweight linen blouse with structured sleeves and pearl buttons.',
        quantity: 8,
        sold: 0,
        price: '1350.00',
        discount: '0.00',
        priceAfterDiscount: linenBlousePrice,
        sizes: ['XS', 'S', 'M', 'L'],
        colors: ['Ivory', 'Dusty Rose'],
        imageId: 'seed/products/linen-puff-sleeve-blouse/cover',
        imageUrl:
          'https://res.cloudinary.com/demo/image/upload/linen-puff-sleeve-blouse.jpg',
        ratingsAverage: null,
        ratingsQuantity: 0,
        status: ProductStatus.DRAFT,
        featured: false,
        categoryId: separates.id,
      },
      create: {
        name: 'Linen Puff-Sleeve Blouse',
        slug: 'linen-puff-sleeve-blouse',
        description:
          'Lightweight linen blouse with structured sleeves and pearl buttons.',
        quantity: 8,
        sold: 0,
        price: '1350.00',
        discount: '0.00',
        priceAfterDiscount: linenBlousePrice,
        sizes: ['XS', 'S', 'M', 'L'],
        colors: ['Ivory', 'Dusty Rose'],
        imageId: 'seed/products/linen-puff-sleeve-blouse/cover',
        imageUrl:
          'https://res.cloudinary.com/demo/image/upload/linen-puff-sleeve-blouse.jpg',
        status: ProductStatus.DRAFT,
        categoryId: separates.id,
      },
    });

    const velvetDressPrice = discountedPrice(180_000, 10);
    const velvetDress = await prisma.product.upsert({
      where: { slug: 'velvet-wrap-dress' },
      update: {
        name: 'Velvet Wrap Dress',
        description:
          'Long-sleeve velvet wrap dress retained as a historical catalog item.',
        quantity: 0,
        sold: 1,
        price: '1800.00',
        discount: '10.00',
        priceAfterDiscount: velvetDressPrice,
        sizes: ['M', 'L'],
        colors: ['Burgundy'],
        imageId: 'seed/products/velvet-wrap-dress/cover',
        imageUrl:
          'https://res.cloudinary.com/demo/image/upload/velvet-wrap-dress.jpg',
        ratingsAverage: null,
        ratingsQuantity: 0,
        status: ProductStatus.ARCHIVED,
        featured: false,
        categoryId: dresses.id,
      },
      create: {
        name: 'Velvet Wrap Dress',
        slug: 'velvet-wrap-dress',
        description:
          'Long-sleeve velvet wrap dress retained as a historical catalog item.',
        quantity: 0,
        sold: 1,
        price: '1800.00',
        discount: '10.00',
        priceAfterDiscount: velvetDressPrice,
        sizes: ['M', 'L'],
        colors: ['Burgundy'],
        imageId: 'seed/products/velvet-wrap-dress/cover',
        imageUrl:
          'https://res.cloudinary.com/demo/image/upload/velvet-wrap-dress.jpg',
        status: ProductStatus.ARCHIVED,
        categoryId: dresses.id,
      },
    });

    const productSubCategories = [
      [satinDress.id, eveningDresses.id],
      [linenBlouse.id, blouses.id],
      [velvetDress.id, dayDresses.id],
    ] as const;

    for (const [productId, subCategoryId] of productSubCategories) {
      await prisma.productSubCategory.upsert({
        where: {
          productId_subCategoryId: { productId, subCategoryId },
        },
        update: {},
        create: { productId, subCategoryId },
      });
    }

    const productImages = [
      {
        id: 'seed_image_satin_front',
        productId: satinDress.id,
        imageId: 'seed/products/satin-cowl-neck-dress/front',
        imageUrl:
          'https://res.cloudinary.com/demo/image/upload/satin-cowl-neck-dress-front.jpg',
        sortOrder: 0,
      },
      {
        id: 'seed_image_satin_back',
        productId: satinDress.id,
        imageId: 'seed/products/satin-cowl-neck-dress/back',
        imageUrl:
          'https://res.cloudinary.com/demo/image/upload/satin-cowl-neck-dress-back.jpg',
        sortOrder: 1,
      },
      {
        id: 'seed_image_linen_front',
        productId: linenBlouse.id,
        imageId: 'seed/products/linen-puff-sleeve-blouse/front',
        imageUrl:
          'https://res.cloudinary.com/demo/image/upload/linen-puff-sleeve-blouse-front.jpg',
        sortOrder: 0,
      },
      {
        id: 'seed_image_velvet_front',
        productId: velvetDress.id,
        imageId: 'seed/products/velvet-wrap-dress/front',
        imageUrl:
          'https://res.cloudinary.com/demo/image/upload/velvet-wrap-dress-front.jpg',
        sortOrder: 0,
      },
    ];

    for (const image of productImages) {
      await prisma.productImage.upsert({
        where: { id: image.id },
        update: image,
        create: image,
      });
    }

    await prisma.review.upsert({
      where: {
        userId_productId: {
          userId: admin.id,
          productId: satinDress.id,
        },
      },
      update: {
        title: 'Elegant finish and excellent drape',
        ratings: '4.0',
      },
      create: {
        title: 'Elegant finish and excellent drape',
        ratings: '4.0',
        userId: admin.id,
        productId: satinDress.id,
      },
    });

    await prisma.review.upsert({
      where: {
        userId_productId: {
          userId: customer.id,
          productId: satinDress.id,
        },
      },
      update: {
        title: 'Beautiful fit for an evening event',
        ratings: '5.0',
      },
      create: {
        title: 'Beautiful fit for an evening event',
        ratings: '5.0',
        userId: customer.id,
        productId: satinDress.id,
      },
    });

    await prisma.coupon.upsert({
      where: { name: 'WELCOME15' },
      update: {
        discount: '15.00',
        usedCount: 0,
        maxUsage: 100,
        perUserLimit: 1,
        expire: new Date('2027-12-31T23:59:59.000Z'),
        isActive: true,
      },
      create: {
        name: 'WELCOME15',
        discount: '15.00',
        maxUsage: 100,
        perUserLimit: 1,
        expire: new Date('2027-12-31T23:59:59.000Z'),
      },
    });

    await prisma.coupon.upsert({
      where: { name: 'SUMMER20' },
      update: {
        discount: '20.00',
        usedCount: 0,
        maxUsage: 50,
        perUserLimit: 1,
        expire: new Date('2026-06-30T23:59:59.000Z'),
        isActive: false,
      },
      create: {
        name: 'SUMMER20',
        discount: '20.00',
        maxUsage: 50,
        perUserLimit: 1,
        expire: new Date('2026-06-30T23:59:59.000Z'),
        isActive: false,
      },
    });

    // Prisma's `upsert` compiles to `INSERT ... ON CONFLICT (country, governorate)`,
    // but the only constraint on those two columns is the partial unique index
    // `shippingZones_country_governorate_null_city_key` (filtered on `city IS NULL`),
    // which Postgres can't use as an ON CONFLICT arbiter. Emulate upsert manually instead.
    const cairoGovernorateZone = await prisma.shippingZone.findFirst({
      where: { country: 'Egypt', governorate: 'Cairo', city: null },
    });

    if (cairoGovernorateZone) {
      await prisma.shippingZone.update({
        where: { id: cairoGovernorateZone.id },
        data: { fee: '90.00', isActive: true },
      });
    } else {
      await prisma.shippingZone.create({
        data: {
          country: 'Egypt',
          governorate: 'Cairo',
          city: null,
          fee: '90.00',
        },
      });
    }

    await prisma.shippingZone.upsert({
      where: {
        country_governorate_city: {
          country: 'Egypt',
          governorate: 'Cairo',
          city: 'Nasr City',
        },
      },
      update: {
        fee: '75.00',
        isActive: true,
      },
      create: {
        country: 'Egypt',
        governorate: 'Cairo',
        city: 'Nasr City',
        fee: '75.00',
      },
    });

    const pendingOrder = await prisma.order.upsert({
      where: { humanOrderId: 'ORD-900001' },
      update: {
        status: OrderStatus.PENDING,
        paymentMethod: PaymentMethod.CASH,
        shippingFees: '75.00',
        totalOrderPrice: '2115.00',
        isPaid: false,
        paidAt: null,
        isDelivered: false,
        deliveredAt: null,
        notes: 'Please call before delivery.',
        userId: customer.id,
        shippingAddressId: customerAddress.id,
      },
      create: {
        humanOrderId: 'ORD-900001',
        status: OrderStatus.PENDING,
        paymentMethod: PaymentMethod.CASH,
        shippingFees: '75.00',
        totalOrderPrice: '2115.00',
        notes: 'Please call before delivery.',
        userId: customer.id,
        shippingAddressId: customerAddress.id,
      },
    });

    const deliveredAt = new Date('2026-06-20T15:30:00.000Z');
    const deliveredOrder = await prisma.order.upsert({
      where: { humanOrderId: 'ORD-900002' },
      update: {
        status: OrderStatus.DELIVERED,
        paymentMethod: PaymentMethod.CASH,
        shippingFees: '90.00',
        totalOrderPrice: '1710.00',
        isPaid: true,
        paidAt: deliveredAt,
        isDelivered: true,
        deliveredAt,
        notes: null,
        userId: customer.id,
        shippingAddressId: customerAddress.id,
      },
      create: {
        humanOrderId: 'ORD-900002',
        status: OrderStatus.DELIVERED,
        paymentMethod: PaymentMethod.CASH,
        shippingFees: '90.00',
        totalOrderPrice: '1710.00',
        isPaid: true,
        paidAt: deliveredAt,
        isDelivered: true,
        deliveredAt,
        userId: customer.id,
        shippingAddressId: customerAddress.id,
      },
    });

    await prisma.orderItem.upsert({
      where: { id: 'seed_order_item_pending_satin' },
      update: {
        quantity: 1,
        color: 'Emerald',
        size: 'M',
        price: satinDressPrice,
        orderId: pendingOrder.id,
        productId: satinDress.id,
      },
      create: {
        id: 'seed_order_item_pending_satin',
        quantity: 1,
        color: 'Emerald',
        size: 'M',
        price: satinDressPrice,
        orderId: pendingOrder.id,
        productId: satinDress.id,
      },
    });

    await prisma.orderItem.upsert({
      where: { id: 'seed_order_item_delivered_velvet' },
      update: {
        quantity: 1,
        color: 'Burgundy',
        size: 'M',
        price: velvetDressPrice,
        orderId: deliveredOrder.id,
        productId: velvetDress.id,
      },
      create: {
        id: 'seed_order_item_delivered_velvet',
        quantity: 1,
        color: 'Burgundy',
        size: 'M',
        price: velvetDressPrice,
        orderId: deliveredOrder.id,
        productId: velvetDress.id,
      },
    });

    console.log(
      'Seed complete: 2 users, 1 address, 2 categories, 3 subcategories, ' +
        '3 products, 4 product images, 2 reviews, 2 coupons, ' +
        '2 shipping zones, 2 orders, 2 order items.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});

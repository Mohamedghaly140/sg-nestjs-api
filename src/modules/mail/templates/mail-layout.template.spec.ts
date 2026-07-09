import { renderMailLayout } from './mail-layout.template';

describe('renderMailLayout', () => {
  it('renders the hidden preview text and heading', () => {
    const rendered = renderMailLayout({
      previewText: 'Your SG Couture update',
      heading: 'Order ORD-000001',
      blocks: [{ type: 'paragraph', text: 'Hello Customer,' }],
    });

    expect(rendered.html).toContain('display:none');
    expect(rendered.html).toContain('mso-hide:all');
    expect(rendered.html).toContain('Your SG Couture update');
    expect(rendered.html).toContain('Order ORD-000001');
    expect(rendered.text).toContain('Order ORD-000001');
  });

  it('renders paragraph blocks in html and text', () => {
    const rendered = renderMailLayout({
      previewText: 'Preview',
      heading: 'Heading',
      blocks: [{ type: 'paragraph', text: 'We received your order.' }],
    });

    expect(rendered.html).toContain('We received your order.');
    expect(rendered.text).toContain('We received your order.');
  });

  it('renders item table blocks in html and text', () => {
    const rendered = renderMailLayout({
      previewText: 'Preview',
      heading: 'Heading',
      blocks: [
        {
          type: 'itemsTable',
          items: [
            {
              name: 'Silk Dress',
              quantity: 2,
              price: '120.00',
              lineTotal: '240.00',
            },
          ],
        },
      ],
    });

    expect(rendered.html).toContain('<th');
    expect(rendered.html).toContain('Silk Dress');
    expect(rendered.html).toContain('EGP 120.00');
    expect(rendered.html).toContain('EGP 240.00');
    expect(rendered.text).toContain('- Silk Dress x 2: EGP 240.00');
  });

  it('renders totals blocks in html and text', () => {
    const rendered = renderMailLayout({
      previewText: 'Preview',
      heading: 'Heading',
      blocks: [
        {
          type: 'totals',
          itemsSubtotal: '240.00',
          discountApplied: '20.00',
          shippingFees: '65.00',
          totalOrderPrice: '285.00',
        },
      ],
    });

    expect(rendered.html).toContain('Subtotal');
    expect(rendered.html).toContain('EGP 240.00');
    expect(rendered.html).toContain('Discount');
    expect(rendered.html).toContain('EGP 20.00');
    expect(rendered.html).toContain('Shipping');
    expect(rendered.html).toContain('EGP 65.00');
    expect(rendered.html).toContain('Total');
    expect(rendered.html).toContain('EGP 285.00');
    expect(rendered.text).toContain(
      [
        'Subtotal: EGP 240.00',
        'Discount: EGP 20.00',
        'Shipping: EGP 65.00',
        'Total: EGP 285.00',
      ].join('\n'),
    );
  });

  it('escapes html-rendered dynamic content without escaping text output', () => {
    const rendered = renderMailLayout({
      previewText: 'Preview <danger>',
      heading: 'Order <ORD-&"1">',
      blocks: [
        { type: 'paragraph', text: 'Hello Sara <Admin> & "VIP",' },
        {
          type: 'itemsTable',
          items: [
            {
              name: 'Dress <Limited> & "Gold"',
              quantity: 1,
              price: '100.00',
              lineTotal: '100.00',
            },
          ],
        },
      ],
    });

    expect(rendered.html).toContain('Preview &lt;danger&gt;');
    expect(rendered.html).toContain('Order &lt;ORD-&amp;&quot;1&quot;&gt;');
    expect(rendered.html).toContain(
      'Hello Sara &lt;Admin&gt; &amp; &quot;VIP&quot;,',
    );
    expect(rendered.html).toContain(
      'Dress &lt;Limited&gt; &amp; &quot;Gold&quot;',
    );
    expect(rendered.html).not.toContain('Hello Sara <Admin> & "VIP",');
    expect(rendered.text).toContain('Hello Sara <Admin> & "VIP",');
    expect(rendered.text).toContain('Dress <Limited> & "Gold"');
  });

  it('renders button blocks as a link in html and label-url text', () => {
    const rendered = renderMailLayout({
      previewText: 'Preview',
      heading: 'Heading',
      blocks: [
        {
          type: 'button',
          label: 'Claim order',
          url: 'https://storefront.test/orders/claim?token=guest-token',
        },
      ],
    });

    expect(rendered.html).toContain(
      '<a href="https://storefront.test/orders/claim?token=guest-token"',
    );
    expect(rendered.html).toContain('Claim order');
    expect(rendered.text).toContain(
      'Claim order: https://storefront.test/orders/claim?token=guest-token',
    );
  });
});

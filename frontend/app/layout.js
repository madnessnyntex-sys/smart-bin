import './globals.css';

export const metadata = {
  title: 'Smart Bin Rice Vendo',
  description: 'Dashboard for the smart trash bin that gives rice for recyclables',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import { type Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Onlook',
    description: 'Onlook – Import Figma File',
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
    return <>{children}</>;
}

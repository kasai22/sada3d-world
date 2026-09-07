import * as React from 'react';
export interface BreadcrumbItem { label: string; href?: string }
export interface BreadcrumbsProps { items?: Array<string | BreadcrumbItem>; style?: React.CSSProperties }
export declare function Breadcrumbs(props: BreadcrumbsProps): JSX.Element;

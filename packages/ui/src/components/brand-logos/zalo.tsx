import type * as React from "react";

const ZaloLogo = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
		aria-hidden="true"
		{...props}
	>
		<path
			d="M7 2h10a5 5 0 0 1 5 5v6a5 5 0 0 1-5 5h-5.4l-5.6 3.2a0.55 0.55 0 0 1-0.8-0.62l0.9-2.9A5 5 0 0 1 2 13V7a5 5 0 0 1 5-5z"
			fill="#0068FF"
		/>
		<path
			d="M7.6 6.4h8.8v1.6l-5.9 5.6h5.9v1.6H7.6v-1.6l5.9-5.6H7.6z"
			fill="#FFFFFF"
		/>
	</svg>
);

export default ZaloLogo;

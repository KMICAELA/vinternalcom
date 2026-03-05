export interface PortfolioComment {
  company: string;
  region: string | null;
  type: string | null;
  thesis: string | null;
  theme: string | null;
  stage: string | null;
  whatTheyDo: string | null;
  targetMarket: string | null;
  tailwinds: string | null;
  challenges: string | null;
}

export const portfolioCommentsSeed: PortfolioComment[] = [
  { company: "101OBEX, CORP", region: null, type: null, thesis: null, theme: null, stage: null,
    whatTheyDo: "101OBEX offers a comprehensive full-stack API platform designed to accelerate the development of core banking and fintech solutions. Their platform provides a suite of APIs and development tools that enable rapid integration of financial services.",
    targetMarket: "Financial institutions, fintech startups, and developers seeking to create or enhance financial services applications.",
    tailwinds: null, challenges: null },
  { company: "Agrippa Industries Inc.", region: null, type: null, thesis: null, theme: null, stage: null,
    whatTheyDo: "Agrippa is a sustainable logistics company focused on commercial freight shipping. They develop technology to reduce emissions in freight transport.",
    targetMarket: "Commercial freight customers",
    tailwinds: null, challenges: null },
  { company: "Air Company Holdings, Inc.", region: null, type: null, thesis: null, theme: null, stage: null,
    whatTheyDo: "Air Company transforms captured CO₂ into sustainable products like alcohol and fuel using their proprietary carbon conversion technology.",
    targetMarket: "Consumer brands, fuel industries, sustainability-focused companies",
    tailwinds: null, challenges: null },
  { company: "Airloom Energy, Inc.", region: null, type: null, thesis: null, theme: null, stage: null,
    whatTheyDo: "Airloom Energy develops and manufactures wind energy airframes that generate electricity from wind at a fraction of the cost of traditional turbines.",
    targetMarket: "Utility companies and other large-scale energy consumers",
    tailwinds: null, challenges: null },
  { company: "Around Corp.", region: null, type: null, thesis: null, theme: null, stage: null,
    whatTheyDo: "Around operates Mexico's largest network of dedicated workspaces, offering an asset-light flexible office model.",
    targetMarket: "Startups and small businesses in Mexico",
    tailwinds: null, challenges: null },
  { company: "Beam Tech Inc.", region: null, type: null, thesis: null, theme: null, stage: null,
    whatTheyDo: "FocalHeat is developing advanced electric infrared heating panels designed to decarbonize space and process heating.",
    targetMarket: "Commercial property owners and managers seeking low-carbon heating solutions",
    tailwinds: null, challenges: null },
  { company: "Blue Energy Global Inc.", region: null, type: null, thesis: null, theme: null, stage: null,
    whatTheyDo: "Blue Energy is focused on making nuclear energy cheaper and faster to build by commercializing modular reactor technology.",
    targetMarket: "Industrial sectors and large-scale energy consumers seeking reliable, low-carbon power",
    tailwinds: null, challenges: null },
  { company: "CargoKite GmbH", region: null, type: null, thesis: null, theme: null, stage: null,
    whatTheyDo: "CargoKite is a maritime hard tech company that develops emission-free, autonomous kite-powered cargo vessels.",
    targetMarket: "Shipping companies seeking more sustainable and efficient maritime logistics solutions",
    tailwinds: null, challenges: null },
  { company: "Chaos Industries, Inc.", region: null, type: null, thesis: null, theme: null, stage: null,
    whatTheyDo: "Chaos Inc. develops advanced technology to help military and critical industries detect, track, and defeat threats.",
    targetMarket: "Government defense agencies, military organizations, and infrastructure sectors",
    tailwinds: null, challenges: null },
  { company: "Checksum AI, Inc.", region: null, type: null, thesis: null, theme: null, stage: null,
    whatTheyDo: "Checksum AI automates end-to-end software testing by observing real user sessions and generating tests automatically.",
    targetMarket: "Mid to large-scale software engineering teams and product-led tech companies",
    tailwinds: null, challenges: null },
];

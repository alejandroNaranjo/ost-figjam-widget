const { widget } = figma;
const { AutoLayout, Input, SVG, Text, useSyncedState, usePropertyMenu, useWidgetNodeId } =
  widget;
import { CardType, cardColors, cardTypes, cartTypeRelations, cardStatuses, CardStatusType, Link, LayoutType, layoutTypes, LayoutContext } from './types'
import { autoLayout, cascadeLayoutChange, collapse, expand, findConnections, } from './auto-layout';

const placeholderTexts: { [t in CardType]: string } = {
  "Business Outcome": "A measurement of business impact.",
  "Product Outcome": "A measurement of customer behavior change.",
  "Objective": "A qualitative and inspirational goal.",
  "Key Result": "A quantified measure of the objective.",
  "Opportunity": "An unmet customer need.",
  "Solution": "An idea that solves a problem.",
  "Assumption": "A belief of user behaviors.",
  "Experiment": "A test to valid or invalid an assumption."
}

const globalCornerRadius = 8;

const debugMode = false;

function CardTypeLabel({label, fillColor} : { label: string, fillColor: string }) {

  const padding: WidgetJSX.Padding = {
    top: 8,
    bottom: 8,
    left: 20,
    right: 20
  };

  const radius: WidgetJSX.CornerRadius = {
    topLeft: globalCornerRadius,
    topRight: 0,
    bottomLeft: 0,
    bottomRight: globalCornerRadius
  };

  return (
    <AutoLayout padding={padding} fill={fillColor} cornerRadius={radius}>
      <Text fontWeight="bold" letterSpacing={0.4} fontSize={13}>{label.toUpperCase()}</Text>
    </AutoLayout>
  );
}

function CardStatusLabel({label, color} : { label: string, color: string }) {
  return (
    <AutoLayout verticalAlignItems="center" spacing={10} padding={{ top: 4, bottom: 0, left: 0, right: 0 }}>
      <Text fontWeight={'bold'} fontSize={14} fill="#666" >{label}</Text>
      <AutoLayout cornerRadius={100} fill={color} width={10} height={10} />
    </AutoLayout>
  );
}

function ExpandTip({layoutType, color, widgetId} : { layoutType:LayoutType, color: string, widgetId: string }) {
  const [hideChildren,] = useSyncedState('hideChildren', false);
  const [, setHeightWOTip] = useSyncedState('heightWOTip', 0);
  return (
    <AutoLayout hidden={!hideChildren}>
      <AutoLayout
        onClick={async () => {
          const node = await figma.getNodeByIdAsync(widgetId) as WidgetNode;
          setHeightWOTip(node.height - 18);
          //LayoutType hasn't changed, so the previous and current values in LayoutContext are the same
          const layoutContext = {
            previousLayoutType: layoutType,
            currentLayoutType: layoutType
          };
          expand(node, layoutContext);
          cascadeLayoutChange(node, layoutContext);
        }}
        opacity={0.75} 
        horizontalAlignItems={layoutType === 'Vertical' ? 'center' : undefined}
        verticalAlignItems={layoutType === 'Horizontal' ? 'center' : undefined}
        padding={layoutType === 'Vertical' ? { top: 2 } : { left: 0 }} 
        width={layoutType === 'Vertical' ? 24 : 16} 
        height={layoutType === 'Vertical' ? 18 : 24}
        fill={color} 
        cornerRadius={layoutType === 'Vertical' 
          ? { topLeft: 0, topRight: 0, bottomLeft: 20, bottomRight: 20 }
          : { topLeft: 0, topRight: 20, bottomLeft: 0, bottomRight: 20 }
        }>
        <SVG 
          src='<svg xmlns="http://www.w3.org/2000/svg" height="14" width="12" viewBox="0 0 448 512"><!--! Font Awesome Pro 6.4.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path fill="#333" d="M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>' 
          rotation={layoutType === 'Horizontal' ? 90 : 0}
        />
      </AutoLayout>
    </AutoLayout>
  );
}

function Note({ cardType } : { cardType:CardType}) {
  const [text, setText] = useSyncedState("text", "");

  return (
    <Input
      width="fill-parent"
      fontWeight='medium'
      inputFrameProps={{
        padding: 20
      }}
      onTextEditEnd={(e) => setText(e.characters)}
      placeholder={placeholderTexts[cardType]}
      inputBehavior='multiline'
      value={text}
    />
  );
}

function CategoryInput() {
  const [category, setCategory] = useSyncedState<string>("category", "");
  const [showCategory, ] = useSyncedState<boolean>("showCategory", false);

  if (!showCategory) {
    return null;
  }

  return (
    <AutoLayout width="fill-parent" padding={{ left: 20, right: 20, bottom: 20 }}>
      <Input
        width="fill-parent"
        placeholder="Category"
        value={category}
        onTextEditEnd={(e) => setCategory(e.characters)}
        fontSize={12}
        inputFrameProps={{
          padding: { top: 8, bottom: 8, left: 12, right: 12 },
          stroke: "#dddfe4",
          strokeWidth: 1,
          cornerRadius: 4,
        }}
      />
    </AutoLayout>
  );
}

function DebugInfo() {
  const [runtimeDebugInfo, ] = useSyncedState('runtimeDebugInfo', "");
  return (
    <AutoLayout direction="vertical" padding={{ top: 0, right: 20, left: 20, bottom: 20 }}>
      <Text>// DEBUG: {useWidgetNodeId()} //</Text>
      <Text>{runtimeDebugInfo}</Text>
    </AutoLayout>
  )
}

async function cloneWidget(widgetId: string, syncState: object, xOffset: number, yOffset: number) {
  const thisWidget = await figma.getNodeByIdAsync(widgetId) as WidgetNode;
  const newWidget = thisWidget.clone();

  newWidget.x = thisWidget.x + (xOffset == 0 ? 0 : xOffset + (xOffset > 0 ? thisWidget.width : -thisWidget.width));
  newWidget.y = thisWidget.y + (yOffset == 0 ? 0 : yOffset + (yOffset > 0 ? thisWidget.height : -thisWidget.height));
  newWidget.setWidgetSyncedState(syncState);

  thisWidget.parent!.appendChild(newWidget);

  return newWidget;
}

function connectWidgets(startWidgetId: string, endWidgetId: string, layoutType: string) {
  const connector = figma.createConnector();

  connector.connectorStartStrokeCap = "NONE";
  connector.connectorEndStrokeCap = "NONE";
  connector.connectorLineType = "ELBOWED";

  connector.connectorStart = {
    endpointNodeId: startWidgetId,
    magnet: layoutType === 'Horizontal' ? 'RIGHT' : 'BOTTOM'
  };

  connector.connectorEnd = {
    endpointNodeId: endWidgetId,
    magnet: layoutType === 'Horizontal' ? 'LEFT' : 'TOP'
  }
}

function Links() {
  const [links, setLinks] = useSyncedState<Link[]>('links', []);
  const [linksInEditing, setLinksInEditing] = useSyncedState('linksInEditing', false);

  function addLink() {
    links.push({ key: Date.now().toString(), text: "", url: "", inEditing: true } as Link);
    setLinks(links);
  }

  function removeLink(key: string) {
    setLinks(links.filter(l => { return l.key != key; }))
  }

  function saveLink(key: string, text: string, url: string) {
    const link: Link = links.filter(l => { return l.key == key })[0];
    link.text = text;
    link.url = url;
    setLinks(links);
  }

  function finishEditing() {
    setLinksInEditing(false);
  }

  return (
    <AutoLayout hidden={links.length <= 0 } width='fill-parent' direction="vertical" padding={{top: 0, left:20, right:20, bottom:20}} spacing={12}>
      {
        links.map(l => {

          if (linksInEditing) {
            return (
              <AutoLayout width={'fill-parent'} spacing={12} verticalAlignItems="center">
                <AutoLayout
                  stroke={"#dddfe4"}
                  strokeWidth={1}
                  direction="vertical"
                  width="fill-parent"
                  cornerRadius={8}
                >
                  <Input
                    placeholder='Text'
                    width="fill-parent"
                    onTextEditEnd={(e) => { saveLink(l.key, e.characters, l.url) }}
                    value={l.text}
                    inputFrameProps={{ padding: { top: 10, left: 10, right: 10, bottom: 5 } }}
                  />
                  <Input
                    placeholder='https://'
                    width="fill-parent"
                    onTextEditEnd={(e) => { saveLink(l.key, l.text, e.characters) }}
                    value={l.url}
                    inputFrameProps={{ padding: { top: 5, left: 10, right: 10, bottom: 10 } }}
                  />
                </AutoLayout>
                <SVG src={`
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="20" height="20">
                  <path fill="#bb4533" d="M170.5 51.6L151.5 80h145l-19-28.4c-1.5-2.2-4-3.6-6.7-3.6H177.1c-2.7 0-5.2 1.3-6.7 3.6zm147-26.6L354.2 80H368h48 8c13.3 0 24 10.7 24 24s-10.7 24-24 24h-8V432c0 44.2-35.8 80-80 80H112c-44.2 0-80-35.8-80-80V128H24c-13.3 0-24-10.7-24-24S10.7 80 24 80h8H80 93.8l36.7-55.1C140.9 9.4 158.4 0 177.1 0h93.7c18.7 0 36.2 9.4 46.6 24.9zM80 128V432c0 17.7 14.3 32 32 32H336c17.7 0 32-14.3 32-32V128H80zm80 64V400c0 8.8-7.2 16-16 16s-16-7.2-16-16V192c0-8.8 7.2-16 16-16s16 7.2 16 16zm80 0V400c0 8.8-7.2 16-16 16s-16-7.2-16-16V192c0-8.8 7.2-16 16-16s16 7.2 16 16zm80 0V400c0 8.8-7.2 16-16 16s-16-7.2-16-16V192c0-8.8 7.2-16 16-16s16 7.2 16 16z"/>
                </svg>
              `}
                  opacity={.4}
                  hoverStyle={{ opacity: 1 }}
                  onClick={() => { removeLink(l.key) }}
                />
              </AutoLayout>

            )
          }
          else {
            return (
              <AutoLayout width={'fill-parent'} spacing={8} direction='horizontal' verticalAlignItems='center'
                onClick={() => {
                  return new Promise(() => {
                    figma.showUI(`<script>window.open('${l.url}','_blank')</script>`, { visible: false });
                    setTimeout(figma.closePlugin, 1000);
                  })
                }}
              >
                <SVG src={`
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" width="16" height="16">
                <path fill="#999" d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/>                </svg>
                `} />
                <Text fill={'#999'}>{l.text}</Text>
              </AutoLayout>
            )
          }
        }
        )
      }
      {
        linksInEditing == true &&
        <AutoLayout width={'fill-parent'} direction='vertical' spacing={20}>
          <AutoLayout width={'fill-parent'} verticalAlignItems='center'
            onClick={() => { addLink(); }}>
            <SVG positioning='absolute' y={2} hoverStyle={{ opacity: 0 }} src={`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="14" height="14">
            <path fill="#b2b2b2" d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 192H32c-17.7 0-32 14.3-32 32s14.3 32 32 32H224V480c0 17.7 14.3 32 32 32s32-14.3 32-32V288l192 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-192 0 0-192z"/>
          </svg>
        `} />
            <SVG positioning='absolute' y={2} opacity={0} hoverStyle={{ opacity: 1 }} src={`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="14" height="14">
            <path fill="#333" d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 192H32c-17.7 0-32 14.3-32 32s14.3 32 32 32H224V480c0 17.7 14.3 32 32 32s32-14.3 32-32V288l192 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-192 0 0-192z"/>
          </svg>
        `} />
            <Text positioning='absolute' x={24} fill={'#b2b2b2'} hoverStyle={{ fill: '#333' }}>Add a link</Text>
          </AutoLayout>
          <AutoLayout
            fill={'#666'}
            hoverStyle={{ fill: '#333' }}
            width={'fill-parent'}
            cornerRadius={8}
            padding={10}
            onClick={() => { finishEditing(); }}
            horizontalAlignItems={'center'}
          >
            <Text fill={'#fff'}>Save</Text>
          </AutoLayout>

        </AutoLayout>
      }

    </AutoLayout>
  )
}

async function createParent(widgetId: string, cardType: CardType, layoutType: LayoutType, xOffset: number, yOffset: number) {
  const newCardType = cartTypeRelations[cardType].parent;
  if (newCardType != null) {
    const newWidget = await cloneWidget(widgetId, { 'cardType': newCardType, 'layoutType': layoutType }, xOffset, yOffset);
    connectWidgets(newWidget.id, widgetId, layoutType);
    return newWidget;
  }
  return null;
}

async function createChild(widgetId: string, cardType: CardType, layoutType: LayoutType, xOffset: number, yOffset: number) {
  const newCardType = cartTypeRelations[cardType].child;
  if (newCardType != null) {
    const newWidget = await cloneWidget(widgetId, { 'cardType': newCardType, 'parentWidgetId': widgetId, 'layoutType': layoutType }, xOffset, yOffset);
    connectWidgets(widgetId, newWidget.id, layoutType);
    return newWidget;
  }
  return null;
}

async function createSibling(widgetId: string, cardType: CardType, parentWidgetId: string, layoutType: LayoutType, xOffset: number, yOffset: number) {
  const newWidget = await cloneWidget(widgetId, { 'cardType': cardType, 'parentWidgetId': parentWidgetId, 'layoutType': layoutType }, xOffset, yOffset);
  if (parentWidgetId != '') {
    connectWidgets(parentWidgetId, newWidget.id, layoutType);
  }
  return newWidget;
}

async function findTopmostParent(widget: WidgetNode, layoutContext: LayoutContext): Promise<WidgetNode> {
  const connections = await findConnections(widget, layoutContext);
  
  // If no parents, this is the topmost node
  if (connections.parents.length === 0) {
    return widget;
  }
  
  // Otherwise, continue up through the parent
  return findTopmostParent(connections.parents[0].widget, layoutContext);
}

async function propagateLayoutTypeToChildren(widget: WidgetNode, layoutContext: LayoutContext, parentConnector?: ConnectorNode): Promise<void> {
  const layoutType = layoutContext.currentLayoutType;

  widget.setWidgetSyncedState({
    ...widget.widgetSyncedState,
    layoutType: layoutType
  });
  
  // Update the connector from parent if it exists
  if (parentConnector) {
    // Parent's end connects to current widget
    const startEndpoint = parentConnector.connectorStart as ConnectorEndpointEndpointNodeIdAndMagnet;
    parentConnector.connectorStart = {
      endpointNodeId: startEndpoint.endpointNodeId, // Keep the parent's ID
      magnet: layoutType === 'Vertical' ? 'BOTTOM' : 'RIGHT'
    };
    parentConnector.connectorEnd = {
      endpointNodeId: widget.id,
      magnet: layoutType === 'Vertical' ? 'TOP' : 'LEFT'
    };
  }
  
  // Get children and propagate
  const connections = await findConnections(widget, layoutContext);
  for (const child of connections.children) {
    await propagateLayoutTypeToChildren(child.widget, layoutContext, child.connector);
  }
}

async function propagateLayoutType(widget: WidgetNode, layoutContext: LayoutContext): Promise<void> {
  // Find the topmost parent
  const root = await findTopmostParent(widget, layoutContext);
  
  // Propagate down from the root
  await propagateLayoutTypeToChildren(root, layoutContext);

  await cascadeLayoutChange(root, layoutContext);
}

function Widget() {
  const widgetId = useWidgetNodeId();
  const [cardType, setCardType] = useSyncedState<CardType>("cardType", "Solution");
  const [layoutType, setLayoutType] = useSyncedState<LayoutType>("layoutType", "Vertical");
  const [parentWidgetId, setParentWidgetId] = useSyncedState('parentWidgetId', '');
  const [cardStatus, setCardStatus] = useSyncedState<CardStatusType | string>("cardStatus", "none");
  const [links, setLinks] = useSyncedState<Link[]>("links", []);
  const [, setLinksInEditing] = useSyncedState('linksInEditing', false);
  const [category, setCategory] = useSyncedState<string>("category", "");
  const [showCategory, setShowCategory] = useSyncedState<boolean>("showCategory", false);


  usePropertyMenu(
    [
      {
        itemType: "dropdown",
        options: layoutTypes.map((i) => ({ option: i, label: i })),
        selectedOption: layoutType.toString(),
        tooltip: "Layout",
        propertyName: "layoutType",
      },
      {
        itemType: "separator"
      },
      {
        itemType: "action",
        propertyName: "new-top",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 384 512">
               <!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.-->
               <path fill="#CCC" d="M214.6 9.4c-12.5-12.5-32.8-12.5-45.3 0l-128 128c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L160 109.3 160 480c0 17.7 14.3 32 32 32s32-14.3 32-32l0-370.7 73.4 73.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-128-128z"/>
               </svg>`,
        tooltip: layoutType === 'Vertical' ? "Create parent" : "Create sibling above"
      },
      {
        itemType: "action",
        propertyName: "new-bottom",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 384 512">
               <!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.-->
               <path fill="#CCC" d="M169.4 502.6c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 402.7 224 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 370.7L86.6 329.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128z"/>
               </svg>`,
        tooltip: layoutType === 'Vertical' ? "Create child" : "Create sibling below"
      },
      {
        itemType: "action",
        propertyName: "new-left",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 512 512">
               <!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.-->
               <path fill="#CCC" d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.3 288 480 288c17.7 0 32-14.3 32-32s-14.3-32-32-32l-370.7 0 73.4-73.4c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-128 128z"/>
               </svg>`,
        tooltip: layoutType === 'Vertical' ? "Create sibling to the left" : "Create parent"
      },
      {
        itemType: "action",
        propertyName: "new-right",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 512 512">
               <!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.-->
               <path fill="#CCC" d="M502.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-128-128c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L402.7 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l370.7 0-73.4 73.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l128-128z"/>
               </svg>`,
        tooltip: layoutType === 'Vertical' ? "Create sibling to the right" : "Create child"
      },
      {
        itemType: "separator"
      },
      {
        itemType: "action",
        propertyName: "auto-layout",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 576 512">
              <!--! Font Awesome Pro 6.4.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. -->
              <path fill="#CCC" d="M320 64c8.8 0 16 7.2 16 16v64c0 8.8-7.2 16-16 16H304 272 256c-8.8 0-16-7.2-16-16V80c0-8.8 7.2-16 16-16h64zM256 192h16v48H112c-26.5 0-48 21.5-48 48v32H48c-26.5 0-48 21.5-48 48v64c0 26.5 21.5 48 48 48h64c26.5 0 48-21.5 48-48V368c0-26.5-21.5-48-48-48H96V288c0-8.8 7.2-16 16-16H272v48H256c-26.5 0-48 21.5-48 48v64c0 26.5 21.5 48 48 48h64c26.5 0 48-21.5 48-48V368c0-26.5-21.5-48-48-48H304V272H464c8.8 0 16 7.2 16 16v32H464c-26.5 0-48 21.5-48 48v64c0 26.5 21.5 48 48 48h64c26.5 0 48-21.5 48-48V368c0-26.5-21.5-48-48-48H512V288c0-26.5-21.5-48-48-48H304V192h16c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48H256c-26.5 0-48 21.5-48 48v64c0 26.5 21.5 48 48 48zM48 352h64c8.8 0 16 7.2 16 16v64c0 8.8-7.2 16-16 16H48c-8.8 0-16-7.2-16-16V368c0-8.8 7.2-16 16-16zm208 0h64c8.8 0 16 7.2 16 16v64c0 8.8-7.2 16-16 16H256c-8.8 0-16-7.2-16-16V368c0-8.8 7.2-16 16-16zm208 0h64c8.8 0 16 7.2 16 16v64c0 8.8-7.2 16-16 16H464c-8.8 0-16-7.2-16-16V368c0-8.8 7.2-16 16-16z"/>
              </svg>`,
        tooltip: "Auto layout"
      },
      {
        itemType: "action",
        propertyName: "collapse",
        icon: `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 448 512">
        <path fill="#ccc" d="M160 48c0-8.8-7.2-16-16-16s-16 7.2-16 16l0 112L16 160c-8.8 0-16 7.2-16 16s7.2 16 16 16l128 0c8.8 0 16-7.2 16-16l0-128zM16 320c-8.8 0-16 7.2-16 16s7.2 16 16 16l112 0 0 112c0 8.8 7.2 16 16 16s16-7.2 16-16l0-128c0-8.8-7.2-16-16-16L16 320zM320 48c0-8.8-7.2-16-16-16s-16 7.2-16 16l0 128c0 8.8 7.2 16 16 16l128 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-112 0 0-112zM304 320c-8.8 0-16 7.2-16 16l0 128c0 8.8 7.2 16 16 16s16-7.2 16-16l0-112 112 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-128 0z"/>
        </svg>
        `,
        tooltip: "Collapse"
      },
      {
        itemType: "action",
        propertyName: "expand-all",
        tooltip: "Expand all",
        icon: `
        <svg xmlns="http://www.w3.org/2000/svg" height="18" width="18" viewBox="0 0 512 512">
        <path fill="#ccc" d="M144 32c8.8 0 16 7.2 16 16s-7.2 16-16 16L32 64l0 112c0 8.8-7.2 16-16 16s-16-7.2-16-16L0 48c0-8.8 7.2-16 16-16l128 0zM0 336c0-8.8 7.2-16 16-16s16 7.2 16 16l0 112 112 0c8.8 0 16 7.2 16 16s-7.2 16-16 16L16 480c-8.8 0-16-7.2-16-16L0 336zM432 32c8.8 0 16 7.2 16 16l0 128c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-112L304 64c-8.8 0-16-7.2-16-16s7.2-16 16-16l128 0zM416 336c0-8.8 7.2-16 16-16s16 7.2 16 16l0 128c0 8.8-7.2 16-16 16l-128 0c-8.8 0-16-7.2-16-16s7.2-16 16-16l112 0 0-112z"/>
        </svg>
        `
      },
      {
        itemType: "action",
        propertyName: "toggle-category",
        tooltip: showCategory ? "Hide Category" : "Show Category",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="18" height="18"><path fill="#CCC" d="M0 48V487.7C0 501.1 10.9 512 24.3 512c5 0 9.9-1.5 14-4.4L192 400 345.7 507.6c4.1 2.9 9 4.4 14 4.4c13.4 0 24.3-10.9 24.3-24.3V48c0-26.5-21.5-48-48-48H48C21.5 0 0 21.5 0 48z"/></svg>`
      },
      {
        itemType: "action",
        propertyName: "edit-links",
        tooltip: links.length > 0 ? "Edit links" : "Add a link",
        icon: `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" width="18" height="18">
          <path fill="#CCC" d="M580.3 267.2c56.2-56.2 56.2-147.3 0-203.5C526.8 10.2 440.9 7.3 383.9 57.2l-6.1 5.4c-10 8.7-11 23.9-2.3 33.9s23.9 11 33.9 2.3l6.1-5.4c38-33.2 95.2-31.3 130.9 4.4c37.4 37.4 37.4 98.1 0 135.6L433.1 346.6c-37.4 37.4-98.2 37.4-135.6 0c-35.7-35.7-37.6-92.9-4.4-130.9l4.7-5.4c8.7-10 7.7-25.1-2.3-33.9s-25.1-7.7-33.9 2.3l-4.7 5.4c-49.8 57-46.9 142.9 6.6 196.4c56.2 56.2 147.3 56.2 203.5 0L580.3 267.2zM59.7 244.8C3.5 301 3.5 392.1 59.7 448.2c53.6 53.6 139.5 56.4 196.5 6.5l6.1-5.4c10-8.7 11-23.9 2.3-33.9s-23.9-11-33.9-2.3l-6.1 5.4c-38 33.2-95.2 31.3-130.9-4.4c-37.4-37.4-37.4-98.1 0-135.6L207 165.4c37.4-37.4 98.1-37.4 135.6 0c35.7 35.7 37.6 92.9 4.4 130.9l-5.4 6.1c-8.7 10-7.7 25.1 2.3 33.9s25.1 7.7 33.9-2.3l5.4-6.1c49.9-57 47-142.9-6.5-196.5c-56.2-56.2-147.3-56.2-203.5 0L59.7 244.8z"/>
        </svg>
        
        `
      },
      {
        itemType: "separator"
      },
      {
        itemType: "dropdown",
        options: cardTypes.map((i) => ({ option: i, label: i })),
        selectedOption: cardType.toString(),
        tooltip: "Type",
        propertyName: "cardType",
      },
      {
        itemType: "dropdown",
        options:
          [{ option: "none", label: "No status" }].concat(
            Object.keys(cardStatuses).map(i => ({ option: i, label: i }))
          )
        ,
        selectedOption: cardStatus,
        tooltip: "Status",
        propertyName: "status"
      }
    ],
    async ({ propertyName, propertyValue }) => {
      const thisWidget = await figma.getNodeByIdAsync(widgetId) as WidgetNode;

      switch (propertyName) {
        case 'cardType':
          setCardType(propertyValue as CardType);
          break;

        case 'layoutType': {
            const prevLayoutType = layoutType;
            const currLayoutType = propertyValue as LayoutType;
            const layoutContext = {
              previousLayoutType: prevLayoutType,
              currentLayoutType: currLayoutType
            };
            await setLayoutType(currLayoutType);
            // LayoutType is intended to be a tree-wide property, so we need to propagate it to all widgets in the tree
            await propagateLayoutType(thisWidget, layoutContext);
          }
          break;

        case "new-left": {
          if (layoutType === 'Vertical') {
            // Create sibling to the left in vertical layout
            await createSibling(widgetId, cardType, parentWidgetId, layoutType, -100, 0);
            
          } else {
            // Create parent in horizontal layout
            const newWidget = await createParent(widgetId, cardType, layoutType, -100, 0);
            if (newWidget) {
              setParentWidgetId(newWidget.id);
            }
          }
          //cascadeLayoutChange(thisWidget);
          break;
        }

        case 'new-right': {
          if (layoutType === 'Vertical') {
            // Create sibling to the right in vertical layout
            await createSibling(widgetId, cardType, parentWidgetId, layoutType, 100, 0);
          } else {
            // Create child in horizontal layout
            await createChild(widgetId, cardType, layoutType, 100, 0);
          }
          //cascadeLayoutChange(thisWidget);
          break;
        }

        case 'new-top': {
          if (layoutType === 'Vertical') {
            // Create parent in vertical layout
            const newWidget = await createParent(widgetId, cardType, layoutType, 0, -50);
            if (newWidget) {
              setParentWidgetId(newWidget.id);
            }
          } else {
            // Create sibling above in horizontal layout
            await createSibling(widgetId, cardType, parentWidgetId, layoutType, 0, -50);
          }
          //cascadeLayoutChange(thisWidget);
          break;
        }

        case 'new-bottom': {
          if (layoutType === 'Vertical') {
            // Create child in vertical layout
            await createChild(widgetId, cardType, layoutType, 0, 50);
          } else {
            // Create sibling below in horizontal layout
            await createSibling(widgetId, cardType, parentWidgetId, layoutType, 0, 50);
          }
          //cascadeLayoutChange(thisWidget);
          break;
        }

        case "status": {
          if (propertyValue == 'none')
            setCardStatus("none");
          else
            setCardStatus(propertyValue as CardStatusType);
          break;
        }

        case 'auto-layout': {
          //LayoutType hasn't changed, so the previous and current values in LayoutContext are the same
          const layoutContext = {
            previousLayoutType: layoutType,
            currentLayoutType: layoutType
          };
          autoLayout(thisWidget, layoutContext);
          break;
        }

        case 'collapse': {
          //LayoutType hasn't changed, so the previous and current values in LayoutContext are the same
          const layoutContext = {
            previousLayoutType: layoutType,
            currentLayoutType: layoutType
          };
          collapse(thisWidget, layoutContext);
          cascadeLayoutChange(thisWidget, layoutContext);
          break;
        }

        case 'expand-all': {
          //LayoutType hasn't changed, so the previous and current values in LayoutContext are the same
          const layoutContext = {
            previousLayoutType: layoutType,
            currentLayoutType: layoutType
          };
          expand(thisWidget, layoutContext, true);
          cascadeLayoutChange(thisWidget, layoutContext);
          break;
        }

        case 'toggle-category':
          setShowCategory(!showCategory);
          break;

        case 'edit-links': {
          if (links.length == 0) {
            links.push({ key: Date.now().toString(), text: "", url: "", inEditing: true } as Link);
          }

          setLinks(links);
          setLinksInEditing(true);
          break;
        }

        default:
          break;
      }
    }
  );

  const shadow: WidgetJSX.Effect = {
    type: "drop-shadow",
    color: cardColors[cardType],
    offset: { x: 0, y: 3 },
    blur: 0,
    showShadowBehindNode: true,
  };

  return (
    <AutoLayout 
      direction={layoutType === 'Vertical' ? 'vertical' : 'horizontal'} 
      horizontalAlignItems={layoutType === 'Vertical' ? 'center' : undefined}
      verticalAlignItems={layoutType === 'Horizontal' ? 'center' : undefined}
      padding={layoutType === 'Vertical' ? { bottom: 4 } : { right: 4 }}
    >
      <AutoLayout
        width={400}
        height="hug-contents"
        direction="vertical"
        cornerRadius={globalCornerRadius}
        fill="#fff"
        stroke={cardColors[cardType]}
        strokeWidth={2}
        effect={shadow}
      >
        {cardStatus != "none" ?
          <AutoLayout verticalAlignItems="center" spacing="auto" width="fill-parent" padding={{ left: 0, top: 0, bottom: 0, right: 20 }} >
            <CardTypeLabel label={cardType} fillColor={cardColors[cardType]} />
            <CardStatusLabel label={cardStatus} color={cardStatuses[cardStatus as CardStatusType].color} />
          </AutoLayout>
          :
          <CardTypeLabel label={cardType} fillColor={cardColors[cardType]} />
        }
        <Note cardType={cardType} />
        <CategoryInput />
        <Links />
        {debugMode && <DebugInfo />}
      </AutoLayout>
      <ExpandTip layoutType={layoutType} color={cardColors[cardType]} widgetId={widgetId} />
    </AutoLayout>
  );
}

widget.register(Widget);
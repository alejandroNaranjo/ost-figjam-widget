//const widgetName = "Opportunity Solution Tree";
import { LayoutType, LayoutContext } from "./types";

const margin = { vertical: 80, horizontal: 80 };

type WidgetConnections = {
    widget: WidgetNode;
    parents: { widget: WidgetNode; connector: ConnectorNode }[];
    children: { widget: WidgetNode; connector: ConnectorNode }[];
};

type BoxDimensions = {
    width: number;
    height: number;
    xOffset: number;
    yOffset: number;
};

function setState(widget: WidgetNode, key: string, value: unknown): { [key: string]: unknown } {
    const obj: { [key: string]: unknown } = {};
    obj[key] = value;
    const newState = Object.assign(widget.widgetSyncedState, obj);
    widget.setWidgetSyncedState(newState);
    return newState;
}

export function getState<T>(widget: WidgetNode, key: string): T {
    return widget.widgetSyncedState[key] as T;
}

export function autoLayout(widget: WidgetNode, layoutContext: LayoutContext) {
    updateBox(widget, layoutContext);
    reposition(widget, layoutContext, "children");
}

function sortWidgetNodes(nodes: { widget: WidgetNode }[], layoutContext: LayoutContext) {
    // To preserve sibling order, sorting is done based on the previous layout type
    // Previous type is different from current only when the tree's layout type has changed
    const layoutType = layoutContext.previousLayoutType;
    nodes.sort((a, b) => layoutType === "Vertical" 
        ? a.widget.x - b.widget.x 
        : a.widget.y - b.widget.y
    );
}

export async function findConnections(widget: WidgetNode, layoutContext: LayoutContext): Promise<WidgetConnections> {
    const conns = { widget: widget, parents: [], children: [] } as WidgetConnections;

    for (const con of widget.attachedConnectors) {
        const start = con.connectorStart as ConnectorEndpointEndpointNodeIdAndMagnet,
            end = con.connectorEnd as ConnectorEndpointEndpointNodeIdAndMagnet;

        // If this widget is the start of the connector, it's a parent. Else, if this widget is the end of the connector, it's a child
        if (start.endpointNodeId === widget.id) {
            const childWidget = await figma.getNodeByIdAsync(end.endpointNodeId) as WidgetNode;
            conns.children.push({ widget: childWidget, connector: con });
        } else {
            const parentWidget = await figma.getNodeByIdAsync(start.endpointNodeId) as WidgetNode;
            conns.parents.push({ widget: parentWidget, connector: con });
        }
    }

    sortWidgetNodes(conns.children, layoutContext);

    return conns;
}

async function updateBox(node: WidgetNode, layoutContext: LayoutContext): Promise<BoxDimensions> {
    const layoutType = layoutContext.currentLayoutType;
    // This function will always update descedants recursively.
    const children = (await findConnections(node, layoutContext)).children;

    if (getState(node, "hideChildren") == true || children.length == 0) {
        return setBox(node, { width: node.width, height: node.height, xOffset: 0, yOffset: 0 });
    }

    const myBox = { width: 0, height: 0, xOffset: 0, yOffset: 0 };

    if (layoutType === "Vertical") {
        for(const child of children) {
            myBox.width += (await updateBox(child.widget, layoutContext)).width;
        }
        // add spacing in between
        myBox.width += (children.length - 1) * margin.horizontal;
        // calculate x offset
        myBox.xOffset = await calcLayoutOffset(myBox.width, node.width, children, layoutContext);
    } else {
        for(const child of children) {
            myBox.height += (await updateBox(child.widget, layoutContext)).height;
        }
        // add spacing in between
        myBox.height += (children.length - 1) * margin.vertical;
        // calculate y offset
        myBox.yOffset = await calcLayoutOffset(myBox.height, node.height, children, layoutContext);
    }

    return setBox(node, myBox);
}

async function calcLayoutOffset(parentBoxSize: number, parentSize: number, children: { widget: WidgetNode }[], layoutContext: LayoutContext): Promise<number> {
    const layoutType = layoutContext.currentLayoutType;
    
    const firstChildBox = await getBox(children[0].widget, layoutContext);
    const lastChild = children[children.length - 1];
    const lastChildBox = await getBox(lastChild.widget, layoutContext);

    const firstChildBoxOffset = layoutType === "Vertical" ? firstChildBox.xOffset : firstChildBox.yOffset;
    const lastChildBoxOffset = layoutType === "Vertical" ? lastChildBox.xOffset : lastChildBox.yOffset;
    const lastChildBoxSize = layoutType === "Vertical" ? lastChildBox.width : lastChildBox.height;
    const lastChildSize = layoutType === "Vertical" ? lastChild.widget.width : lastChild.widget.height;

    const childrenSpread = parentBoxSize - firstChildBoxOffset - (lastChildBoxSize - lastChildBoxOffset - lastChildSize); // remove bleeding space from descendants
    const offsetToChildren = (childrenSpread - parentSize) / 2;
    
    return firstChildBoxOffset + offsetToChildren;
}

async function updateParentBox(parent: WidgetNode, layoutContext: LayoutContext): Promise<BoxDimensions> {
    const layoutType = layoutContext.currentLayoutType;
    // This assumes children boxes are already up-to-date
    // This would only occur when propogating thus this node will not be hidden
    const children = (await findConnections(parent, layoutContext)).children;

    const pBox = { width: 0, height: 0, xOffset: 0, yOffset: 0 };

    if (layoutType === "Vertical") {
        for(const child of children) {
            pBox.width += (await getBox(child.widget, layoutContext)).width;
        }
        pBox.width += (children.length - 1) * margin.horizontal;
        pBox.xOffset = await calcLayoutOffset(pBox.width, parent.width, children, layoutContext);
    } else {
        for(const child of children) {
            pBox.height += (await getBox(child.widget, layoutContext)).height;
        }
        pBox.height += (children.length - 1) * margin.vertical;
        pBox.yOffset = await calcLayoutOffset(pBox.height, parent.height, children, layoutContext);
    }

    return setBox(parent, pBox);
}

function setBox(widget: WidgetNode, box: BoxDimensions) {
    setState(widget, "box", box);
    return box;
}

async function getBox(widget: WidgetNode, layoutContext: LayoutContext): Promise<BoxDimensions> {
    let box = getState<BoxDimensions>(widget, "box");
    if (box == null) {
        box = await updateBox(widget, layoutContext);
    }
    return box;
}

async function moveChildrenByBoxDim(anchor: WidgetNode, layoutContext: LayoutContext) {
    const layoutType = layoutContext.currentLayoutType;
    const children = (await findConnections(anchor, layoutContext)).children;
    if (children.length === 0) return;

    const storedHeight = getState<number>(anchor, "heightWOTip");
    const storedWidth = getState<number>(anchor, "widthWOTip");
    const widgetHeight = storedHeight ? storedHeight : anchor.height;
    const widgetWidth = storedWidth ? storedWidth : anchor.width;

    if (layoutType === "Vertical") {
        // Vertical layout: children are arranged horizontally below the parent
        const y = anchor.y + widgetHeight + margin.vertical;
        
        const startingX =
        anchor.x - (await getBox(anchor, layoutContext)).xOffset + (children.length > 0 ? (await getBox(children[0].widget, layoutContext)).xOffset : 0);        

        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            child.widget.y = y;

            if (i == 0) {
                child.widget.x = startingX;
            } else {
                const prevChild = children[i - 1];
                const prevChildBox = await getBox(prevChild.widget, layoutContext);
                const prevChildXRight = prevChild.widget.x - prevChildBox.xOffset + prevChildBox.width;
                child.widget.x = prevChildXRight + margin.horizontal + (await getBox(child.widget, layoutContext)).xOffset;
            }
            moveChildrenByBoxDim(child.widget, layoutContext);
        }
    } else {
        // Horizontal layout: children are arranged vertically to the right of the parent
        const x = anchor.x + widgetWidth + margin.horizontal;

        const startingY =
        anchor.y - (await getBox(anchor, layoutContext)).yOffset + (children.length > 0 ? (await getBox(children[0].widget, layoutContext)).yOffset : 0);

        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            child.widget.x = x;

            if (i == 0) {
                child.widget.y = startingY;
            } else {
                const prevChild = children[i - 1];
                const prevChildBox = await getBox(prevChild.widget, layoutContext);
                const prevChildYBottom = prevChild.widget.y - prevChildBox.yOffset + prevChildBox.height;
                child.widget.y = prevChildYBottom + margin.vertical + (await getBox(child.widget, layoutContext)).yOffset;
            }
            moveChildrenByBoxDim(child.widget, layoutContext);
        }
    }
}

export async function collapse(widget: WidgetNode, layoutContext: LayoutContext) {
    const children = (await findConnections(widget, layoutContext)).children;
    children.forEach(el => {
        collapse(el.widget, layoutContext);
        el.widget.visible = false;
        el.connector.visible = false;
    });
    setState(widget, "childrenCount", children.length);
    if (children.length > 0) setState(widget, "hideChildren", true);
    return children.length;
}

export async function expand(widget: WidgetNode, layoutContext: LayoutContext, recursive?: boolean) {
    const children = (await findConnections(widget, layoutContext)).children;
    children.forEach(el => {
        el.widget.visible = true;
        el.connector.visible = true;
        if (recursive) expand(el.widget, layoutContext, recursive);
    });
    setState(widget, "hideChildren", false);
    return children.length; 
}

export async function cascadeLayoutChange(widget: WidgetNode, layoutContext: LayoutContext) {
    const layoutType = layoutContext.currentLayoutType;
    const prevBox = await getBox(widget, layoutContext);
    const currBox = await updateBox(widget, layoutContext);

    const currBoxSize = layoutType === "Vertical" ? currBox.width : currBox.height;
    const prevBoxSize = layoutType === "Vertical" ? prevBox.width : prevBox.height;
    const currBoxOffset = layoutType === "Vertical" ? currBox.xOffset : currBox.yOffset;
    const prevBoxOffset = layoutType === "Vertical" ? prevBox.xOffset : prevBox.yOffset;

    if (prevBox && prevBoxSize == currBoxSize && prevBoxOffset == currBoxOffset){
        reposition(widget, layoutContext, "children"); // even if the box dimensions don't change, the nodes positions might have been manually adjusted
        return;
    }
    else{
        reposition(widget, layoutContext, "children");
        reposition(widget, layoutContext, "siblings");
        reposition(widget, layoutContext, "parent");
    }
}

async function reposition(widget: WidgetNode, layoutContext: LayoutContext,direction: "children" | "siblings" | "parent") {
    const layoutType = layoutContext.currentLayoutType;
    switch (direction) {
        case "children": {  // previously "down"
            moveChildrenByBoxDim(widget, layoutContext);
            break;
        }

        case "siblings": {  // previously "across"
            const parents = (await findConnections(widget, layoutContext)).parents;
            if (parents.length <= 0) break;

            const siblings = (await findConnections(parents[0].widget, layoutContext)).children;

            const self = siblings.find(e => e.widget.id == widget.id);
            if (self == null) throw new Error("Can't find myself in parent's children!");
            const currPos = siblings.indexOf(self);

            // move the ones before current
            for (let i = currPos - 1; i >= 0; i--) {
                const move = siblings[i];
                const ref = siblings[i + 1];
                const refBox = await getBox(ref.widget, layoutContext);
                const moveBox = await getBox(move.widget, layoutContext);
                
                if (layoutType === "Vertical")
                    move.widget.x = ref.widget.x - refBox.xOffset - margin.horizontal - moveBox.width + moveBox.xOffset;
                else
                    move.widget.y = ref.widget.y - refBox.yOffset - margin.vertical - moveBox.height + moveBox.yOffset;
                
                moveChildrenByBoxDim(move.widget, layoutContext);
            }

            // move the ones after current
            for (let i = currPos + 1; i < siblings.length; i++) {
                const move = siblings[i];
                const ref = siblings[i - 1];
                const refBox = await getBox(ref.widget, layoutContext);
                const moveBox = await getBox(move.widget, layoutContext);
                
                if (layoutType === "Vertical")
                    move.widget.x = ref.widget.x - refBox.xOffset + refBox.width + margin.horizontal + moveBox.xOffset;
                else
                    move.widget.y = ref.widget.y - refBox.yOffset + refBox.height + margin.vertical + moveBox.yOffset;

                moveChildrenByBoxDim(move.widget, layoutContext);
            }
            break;
        }

        case "parent": {  // previously "up"
            const parents = (await findConnections(widget, layoutContext)).parents;
            if (parents.length <= 0) break;

            const parent = parents[0];
            const parentBox = await updateParentBox(parent.widget, layoutContext);
            const siblings = (await findConnections(parent.widget, layoutContext)).children;
            const first = siblings[0];
            const last = siblings[siblings.length - 1];
            const lastBox = await getBox(last.widget, layoutContext);
            const firstBox = await getBox(first.widget, layoutContext);

            const firstBoxOffset = layoutType === "Vertical" ? firstBox.xOffset : firstBox.yOffset;
            const lastBoxOffset = layoutType === "Vertical" ? lastBox.xOffset : lastBox.yOffset;
            const lastBoxSize = layoutType === "Vertical" ? lastBox.width : lastBox.height;
            const lastSize = layoutType === "Vertical" ? last.widget.width : last.widget.height;
            const parentBoxSize = layoutType === "Vertical" ? parentBox.width : parentBox.height;
            const parentSize = layoutType === "Vertical" ? parent.widget.width : parent.widget.height;

            const siblingSpread = parentBoxSize - firstBoxOffset - (lastBoxSize - lastBoxOffset - lastSize);
            const parentOffset = (siblingSpread - parentSize) / 2;

            if (layoutType === "Vertical")
                parent.widget.x = first.widget.x + parentOffset;
            else
                parent.widget.y = first.widget.y + parentOffset;
            
            reposition(parent.widget, layoutContext, "siblings");
            reposition(parent.widget, layoutContext, "parent");
            break;
        }
        
        default:
            break;
    }
}

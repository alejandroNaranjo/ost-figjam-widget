//const widgetName = "Opportunity Solution Tree";
import { LayoutType } from "./types";

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

export function autoLayout(widget: WidgetNode, layoutType: LayoutType) {
    updateBox(widget, layoutType);
    reposition(widget, layoutType, "down");
}

export async function findConnections(widget: WidgetNode): Promise<WidgetConnections> {
    const conns = { widget: widget, parents: [], children: [] } as WidgetConnections;

    for (const con of widget.attachedConnectors) {
        const start = con.connectorStart as ConnectorEndpointEndpointNodeIdAndMagnet,
            end = con.connectorEnd as ConnectorEndpointEndpointNodeIdAndMagnet;

        // If this widget is the start of the connector, it's a parent
        // If this widget is the end of the connector, it's a child
        if (start.endpointNodeId === widget.id) {
            const childWidget = await figma.getNodeByIdAsync(end.endpointNodeId) as WidgetNode;
            conns.children.push({ widget: childWidget, connector: con });
        } else {
            const parentWidget = await figma.getNodeByIdAsync(start.endpointNodeId) as WidgetNode;
            conns.parents.push({ widget: parentWidget, connector: con });
        }
    }

    conns.children.sort((a, b) => a.widget.x - b.widget.x);

    return conns;
}

async function updateBox(node: WidgetNode, layoutType: LayoutType): Promise<BoxDimensions> {
    // This function will always update descedants recursively.
    const children = (await findConnections(node)).children;

    if (getState(node, "hideChildren") == true) {
        return setBox(node, { width: node.width, height: node.height, xOffset: 0, yOffset: 0 });
    }

    if (children.length == 0) {
        return setBox(node, { width: node.width, height: node.height, xOffset: 0, yOffset: 0 });
    } else {
        const myBox = { width: 0, height: 0, xOffset: 0, yOffset: 0 };

        if (layoutType === "Vertical") {
            // Original vertical layout behavior
            // sum all children widths
            for(const child of children) {
                myBox.width += (await updateBox(child.widget, layoutType)).width;
            }
            // add spacing in between
            myBox.width += (children.length - 1) * margin.horizontal;
            // calculate x offset
            myBox.xOffset = await calcLayoutOffset(myBox.width, node.width, children, layoutType);
        } else {
            // Horizontal layout behavior
            // sum all children heights
            for(const child of children) {
                myBox.height += (await updateBox(child.widget, layoutType)).height;
            }
            // add spacing in between
            myBox.height += (children.length - 1) * margin.vertical;
            // calculate y offset
            myBox.yOffset = await calcLayoutOffset(myBox.height, node.height, children, layoutType);
        }

        return setBox(node, myBox);
    }
}

async function calcLayoutOffset(parentBoxSize: number, parentSize: number, children: { widget: WidgetNode }[], layoutType: LayoutType ): Promise<number> {
    const firstChildBox = await getBox(children[0].widget, layoutType);
    const lastChild = children[children.length - 1];
    const lastChildBox = await getBox(lastChild.widget, layoutType);
       
    if (layoutType === "Vertical"){  
        const childrenSpread = parentBoxSize - firstChildBox.xOffset - (lastChildBox.width - lastChildBox.xOffset - lastChild.widget.width); // remove bleeding space from descendants
        const offsetToChildren = (childrenSpread - parentSize) / 2;
        return firstChildBox.xOffset + offsetToChildren;
    } else {
        const childrenSpread = parentBoxSize - firstChildBox.yOffset - (lastChildBox.height - lastChildBox.yOffset - lastChild.widget.height); // remove bleeding space from descendants
        const offsetToChildren = (childrenSpread - parentSize) / 2;
        return firstChildBox.yOffset + offsetToChildren;
    }
}

async function updateParentBox(parent: WidgetNode, layoutType: LayoutType): Promise<BoxDimensions> {
    // This assumes children boxes are already up-to-date
    // This would only occur when propogating thus this node will not be hidden

    const children = (await findConnections(parent)).children;

    const pBox = { width: 0, height: 0, xOffset: 0, yOffset: 0 };

    if (layoutType === "Vertical") {
        for(const child of children) {
            pBox.width += (await getBox(child.widget, layoutType)).width;
        }
        pBox.width += (children.length - 1) * margin.horizontal;
        pBox.xOffset = await calcLayoutOffset(pBox.width, parent.width, children, layoutType);
    } else {
        for(const child of children) {
            pBox.height += (await getBox(child.widget, layoutType)).height;
        }
        pBox.height += (children.length - 1) * margin.vertical;
        pBox.yOffset = await calcLayoutOffset(pBox.height, parent.height, children, layoutType);
    }

    return setBox(parent, pBox);
}

function setBox(widget: WidgetNode, box: BoxDimensions) {
    setState(widget, "box", box);
    return box;
}

async function getBox(widget: WidgetNode, layoutType: LayoutType): Promise<BoxDimensions> {
    let box = getState<BoxDimensions>(widget, "box");
    if (box == null) {
        box = await updateBox(widget, layoutType);
    }
    return box;
}

async function moveChildrenByBoxDim(anchor: WidgetNode, layoutType: LayoutType) {
    const children = (await findConnections(anchor)).children;
    if (children.length === 0) return;

    const storedHeight = getState<number>(anchor, "heightWOTip");
    const storedWidth = getState<number>(anchor, "widthWOTip");
    const widgetHeight = storedHeight ? storedHeight : anchor.height;
    const widgetWidth = storedWidth ? storedWidth : anchor.width;

    if (layoutType === "Vertical") {
        // Vertical layout: children are arranged horizontally below the parent
        const y = anchor.y + widgetHeight + margin.vertical;
        
        const startingX =
        anchor.x - (await getBox(anchor, layoutType)).xOffset + (children.length > 0 ? (await getBox(children[0].widget, layoutType)).xOffset : 0);        

        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            child.widget.y = y;

            if (i == 0) {
                child.widget.x = startingX;
            } else {
                const prevChild = children[i - 1];
                const prevChildBox = await getBox(prevChild.widget, layoutType);
                const prevChildXRight = prevChild.widget.x - prevChildBox.xOffset + prevChildBox.width;
                child.widget.x = prevChildXRight + margin.horizontal + (await getBox(child.widget, layoutType)).xOffset;
            }
            moveChildrenByBoxDim(child.widget, layoutType);
        }
    } else {
        // Horizontal layout: children are arranged vertically to the right of the parent
        const x = anchor.x + widgetWidth + margin.horizontal;

        const startingY =
        anchor.y - (await getBox(anchor, layoutType)).yOffset + (children.length > 0 ? (await getBox(children[0].widget, layoutType)).yOffset : 0);

        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            child.widget.x = x;

            if (i == 0) {
                child.widget.y = startingY;
            } else {
                const prevChild = children[i - 1];
                const prevChildBox = await getBox(prevChild.widget, layoutType);
                const prevChildYBottom = prevChild.widget.y - prevChildBox.yOffset + prevChildBox.height;
                child.widget.y = prevChildYBottom + margin.vertical + (await getBox(child.widget, layoutType)).yOffset;
            }
            moveChildrenByBoxDim(child.widget, layoutType);
        }
    }
}

export async function collapse(widget: WidgetNode) {
    const children = (await findConnections(widget)).children;
    children.forEach(el => {
        collapse(el.widget);
        el.widget.visible = false;
        el.connector.visible = false;
    });
    setState(widget, "childrenCount", children.length);
    if (children.length > 0) setState(widget, "hideChildren", true);
    return children.length;
}

export async function expand(widget: WidgetNode, recursive?: boolean) {
    const children = (await findConnections(widget)).children;
    children.forEach(el => {
        el.widget.visible = true;
        el.connector.visible = true;
        if (recursive) expand(el.widget, recursive);
    });
    setState(widget, "hideChildren", false);
    return children.length; 
}

export async function cascadeLayoutChange(widget: WidgetNode, layoutType: LayoutType) {
    const prevBox = await getBox(widget, layoutType);
    const currBox = await updateBox(widget, layoutType);

    if (layoutType === "Vertical") {
        if (prevBox && prevBox.width == currBox.width && prevBox.xOffset == currBox.xOffset){
            reposition(widget, layoutType, "down"); // even if the box dimensions don't change, the nodes positions might have been manually
            return;
        }
        else{
            reposition(widget, layoutType, "down");
            reposition(widget, layoutType, "across");
            reposition(widget, layoutType, "up");
        }
    }

    else{
        if (prevBox && prevBox.height == currBox.height && prevBox.yOffset == currBox.yOffset){
            reposition(widget, layoutType, "down"); // even if the box dimensions don't change, the nodes positions might have been manually
            return;
        }
        else{
            reposition(widget, layoutType, "down");
            reposition(widget, layoutType, "across");
            reposition(widget, layoutType, "up");
        }
    }
}

async function reposition(widget: WidgetNode, layoutType: LayoutType, direction: "down" | "up" | "across") {
    const isVertical = layoutType === "Vertical";
    
    switch (direction) {
        case "down": {
            moveChildrenByBoxDim(widget, layoutType);
            break;
        }

        case "across": {
            const parents = (await findConnections(widget)).parents;
            if (parents.length <= 0) break;

            const siblings = (await findConnections(parents[0].widget)).children;
            // Sort based on layout direction
            siblings.sort((a, b) => isVertical 
                ? a.widget.x - b.widget.x 
                : a.widget.y - b.widget.y
            );

            const self = siblings.find(e => e.widget.id == widget.id);
            if (self == null) throw new Error("Can't find myself in parent's children!");
            const currPos = siblings.indexOf(self);

            // move the ones before current
            for (let i = currPos - 1; i >= 0; i--) {
                const move = siblings[i];
                const ref = siblings[i + 1];
                const refBox = await getBox(ref.widget, layoutType);
                const moveBox = await getBox(move.widget, layoutType);
                
                if (isVertical) {
                    move.widget.x = ref.widget.x - refBox.xOffset - margin.horizontal - moveBox.width + moveBox.xOffset;
                } else {
                    move.widget.y = ref.widget.y - refBox.yOffset - margin.vertical - moveBox.height + moveBox.yOffset;
                }
                moveChildrenByBoxDim(move.widget, layoutType);
            }

            // move the ones after current
            for (let i = currPos + 1; i < siblings.length; i++) {
                const move = siblings[i];
                const ref = siblings[i - 1];
                const refBox = await getBox(ref.widget, layoutType);
                const moveBox = await getBox(move.widget, layoutType);
                
                if (isVertical) {
                    move.widget.x = ref.widget.x - refBox.xOffset + refBox.width + margin.horizontal + moveBox.xOffset;
                } else {
                    move.widget.y = ref.widget.y - refBox.yOffset + refBox.height + margin.vertical + moveBox.yOffset;
                }
                moveChildrenByBoxDim(move.widget, layoutType);
            }
            break;
        }

        case "up": {
            const parents = (await findConnections(widget)).parents;
            if (parents.length <= 0) break;

            const parent = parents[0];
            const parentBox = await updateParentBox(parent.widget, layoutType);
            const siblings = (await findConnections(parent.widget)).children;
            const first = siblings[0];
            const last = siblings[siblings.length - 1];
            const lastBox = await getBox(last.widget, layoutType);
            const firstBox = await getBox(first.widget, layoutType);

            if (isVertical) {
                const siblingSpread = parentBox.width - firstBox.xOffset - (lastBox.width - lastBox.xOffset - last.widget.width);
                const parentOffset = (siblingSpread - parent.widget.width) / 2;
                parent.widget.x = first.widget.x + parentOffset;
            } else {
                const siblingSpread = parentBox.height - firstBox.yOffset - (lastBox.height - lastBox.yOffset - last.widget.height);
                const parentYOffset = (siblingSpread - parent.widget.height) / 2;
                parent.widget.y = first.widget.y + parentYOffset;
            }

            reposition(parent.widget, layoutType, "across");
            reposition(parent.widget, layoutType, "up");
            break;
        }
        
        default:
            break;
    }
}

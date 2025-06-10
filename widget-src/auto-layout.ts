//const widgetName = "Opportunity Solution Tree";

const margin = { vertical: 80, horizontal: 80 };

type WidgetConnections = {
    widget: WidgetNode;
    parents: { widget: WidgetNode; connector: ConnectorNode }[];
    children: { widget: WidgetNode; connector: ConnectorNode }[];
};

type BoxDimensions = {
    width: number;
    xOffset: number;
};

function setState(widget: WidgetNode, key: string, value: unknown): { [key: string]: unknown } {
    const obj: { [key: string]: unknown } = {};
    obj[key] = value;
    const newState = Object.assign(widget.widgetSyncedState, obj);
    widget.setWidgetSyncedState(newState);
    return newState;
}

function getState<T>(widget: WidgetNode, key: string): T {
    return widget.widgetSyncedState[key] as T;
}

export function autoLayout(widget: WidgetNode) {
    updateBox(widget);
    reposition(widget, "down");
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

async function updateBox(node: WidgetNode): Promise<BoxDimensions> {
    // This function will always update descedants recursively.
    const children = (await findConnections(node)).children;

    if (getState(node, "hideChildren") == true) {
        return setBox(node, { width: node.width, xOffset: 0 });
    }

    if (children.length == 0) {
        return setBox(node, { width: node.width, xOffset: 0 });
    } else {
        const myBox = { width: 0, xOffset: 0 };
        // sum all children widths

        for(const child of children) {
            myBox.width += (await updateBox(child.widget)).width;
        }
        // add spacing in between
        myBox.width += (children.length - 1) * margin.horizontal;

        // calculate x offset
        myBox.xOffset = await calcXOffset(myBox.width, node.width, children);

        return setBox(node, myBox);
    }
}

async function calcXOffset(parentBoxWidth: number, parentWidth: number, children: { widget: WidgetNode }[]): Promise<number> {
    const firstChildBox = await getBox(children[0].widget);
    const lastChild = children[children.length - 1];
    const lastChildBox = await getBox(lastChild.widget);
    const childrenSpread =
        parentBoxWidth - firstChildBox.xOffset - (lastChildBox.width - lastChildBox.xOffset - lastChild.widget.width); // remove bleeding space from descendants
    const offsetToChildren = (childrenSpread - parentWidth) / 2;
    return firstChildBox.xOffset + offsetToChildren;
}

async function updateParentBox(parent: WidgetNode): Promise<BoxDimensions> {
    // This assumes children boxes are already up-to-date
    // This would only occur when propogating thus this node will not be hidden

    const children = (await findConnections(parent)).children;

    const pBox = { width: 0, xOffset: 0 };

    for(const child of children) {
        pBox.width += (await getBox(child.widget)).width;
    }
    pBox.width += (children.length - 1) * margin.horizontal;
    pBox.xOffset = await calcXOffset(pBox.width, parent.width, children);
    return setBox(parent, pBox);
}

function setBox(widget: WidgetNode, box: BoxDimensions) {
    setState(widget, "box", box);
    return box;
}

async function getBox(widget: WidgetNode): Promise<BoxDimensions> {
    let box = getState<BoxDimensions>(widget, "box");
    if (box == null) {
        box = await updateBox(widget);
    }
    return box;
}

async function moveChildrenByBoxDim(anchor: WidgetNode) {
    const children = (await findConnections(anchor)).children;
    const storedHeight = getState<number>(anchor, "heightWOTip");
    const widgetHeight = storedHeight ? storedHeight : anchor.height;
    const y = anchor.y + widgetHeight + margin.vertical;

    const startingX =
        anchor.x - (await getBox(anchor)).xOffset + (children.length > 0 ? (await getBox(children[0].widget)).xOffset : 0);

    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        child.widget.y = y;

        if (i == 0) {
            child.widget.x = startingX; // + selfOffset;
        } else {
            const prevChild = children[i - 1];
            const prevChildBox = await getBox(prevChild.widget);
            const prevChildXRight = prevChild.widget.x - prevChildBox.xOffset + prevChildBox.width;

            child.widget.x = prevChildXRight + margin.horizontal + (await getBox(child.widget)).xOffset;
        }
        moveChildrenByBoxDim(child.widget);
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

export async function cascadeLayoutChange(widget: WidgetNode) {
    const prevBox = await getBox(widget);
    const currBox = await updateBox(widget);
    if (prevBox && prevBox.width == currBox.width && prevBox.xOffset == currBox.xOffset) {
        reposition(widget, "down"); // even if the box dimensions don't change, the nodes positions might have been manually
        return;
    } else {
        reposition(widget, "down"); // needed coz when expanding anchor, the box changes.
        reposition(widget, "across");
        reposition(widget, "up");
    }
}

async function reposition(widget: WidgetNode, direction: "down" | "up" | "across") {
    switch (direction) {
        case "down": {
            moveChildrenByBoxDim(widget);
            break;
        }

        case "across": {
            const parents = (await findConnections(widget)).parents;
            if (parents.length <= 0) break;

            const siblings = (await findConnections(parents[0].widget)).children;
            siblings.sort((a, b) => a.widget.x - b.widget.x);

            const self = siblings.find(e => e.widget.id == widget.id);
            if (self == null) throw new Error("Can't find myself in parent's children!");
            const currPos = siblings.indexOf(self);

            // move the ones on the left
            for (let i = currPos - 1; i >= 0; i--) {
                const move = siblings[i];
                const ref = siblings[i + 1];
                const refBox = await getBox(ref.widget);
                const moveBox = await getBox(move.widget);
                move.widget.x =
                    ref.widget.x -
                    refBox.xOffset - // ref box left
                    margin.horizontal -
                    moveBox.width +
                    moveBox.xOffset;
                moveChildrenByBoxDim(move.widget);
            }
            // move the ones on the right
            for (let i = currPos + 1; i < siblings.length; i++) {
                const move = siblings[i];
                const ref = siblings[i - 1];
                const refBox = await getBox(ref.widget);
                const moveBox = await getBox(move.widget);
                move.widget.x = ref.widget.x - refBox.xOffset + refBox.width + margin.horizontal + moveBox.xOffset;
                moveChildrenByBoxDim(move.widget);
            }

            break;
        }

        case "up": {
            const parents = (await findConnections(widget)).parents;
            if (parents.length <= 0) break;

            const parent = parents[0];
            const parentBox = await updateParentBox(parent.widget);
            const siblings = (await findConnections(parent.widget)).children;
            const first = siblings[0];
            const last = siblings[siblings.length - 1];
            const lastBox = await getBox(last.widget);
            const siblingSpread =
                parentBox.width - (await getBox(first.widget)).xOffset - (lastBox.width - lastBox.xOffset - last.widget.width);
            const parentXOffset = (siblingSpread - parent.widget.width) / 2;
            parent.widget.x = siblings[0].widget.x + parentXOffset;

            reposition(parent.widget, "across");
            reposition(parent.widget, "up");

            break;
        }
        default:
            break;
    }
}

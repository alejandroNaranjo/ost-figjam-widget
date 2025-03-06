const widgetName = "Opportunity Solution Tree";

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

function setState(widget: WidgetNode, key: string, value: any): { [key: string]: any } {
    let obj: { [key: string]: any } = {};
    obj[key] = value;
    let newState = Object.assign(widget.widgetSyncedState, obj);
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

function findConnections(widget: WidgetNode): WidgetConnections {
    var conns = { widget: widget, parents: [], children: [] } as WidgetConnections;
    
    widget.attachedConnectors.forEach(con => {
        let start = con.connectorStart as ConnectorEndpointEndpointNodeIdAndMagnet,
            end = con.connectorEnd as ConnectorEndpointEndpointNodeIdAndMagnet,
            near: ConnectorEndpointEndpointNodeIdAndMagnet,
            far: ConnectorEndpointEndpointNodeIdAndMagnet;
        if (start.endpointNodeId == widget.id) {
            near = start;
            far = end;
        } else {
            near = end;
            far = start;
        }
        let pair = { widget: figma.getNodeById(far.endpointNodeId) as WidgetNode, connector: con };
        if (near.magnet == "BOTTOM") conns.children.push(pair);
        else conns.parents.push(pair);
    });

    conns.children.sort((a, b) => a.widget.x - b.widget.x);

    //console.log(conns);
    return conns;
}

function updateBox(node: WidgetNode) : BoxDimensions {
    // This function will always update descedants recursively.

    var children = findConnections(node).children;

    if (getState(node, "hideChildren") == true) {
        return setBox(node, { width: node.width, xOffset: 0 });
    }

    if (children.length == 0) {
        return setBox(node, { width: node.width, xOffset: 0 });
    } else {
        let myBox = { width: 0, xOffset: 0 };
        // sum all children widths
        children.forEach(child => {
            myBox.width += updateBox(child.widget).width;
        });
        // add spacing in between
        myBox.width += (children.length - 1) * margin.horizontal;

        // calculate x offset
        myBox.xOffset = calcXOffset(myBox.width, node.width, children);

        return setBox(node, myBox);
    }
}

function calcXOffset(parentBoxWidth:number, parentWidth: number, children:{ widget: WidgetNode }[]) : number {
    let firstChildBox = getBox(children[0].widget);
    let lastChild = children[children.length - 1];
    let lastChildBox = getBox(lastChild.widget);
    let childrenSpread =
        parentBoxWidth - firstChildBox.xOffset - (lastChildBox.width - lastChildBox.xOffset - lastChild.widget.width); // remove bleeding space from descendants
    let offsetToChildren = (childrenSpread - parentWidth) / 2;
    return firstChildBox.xOffset + offsetToChildren;
}

function updateParentBox(parent: WidgetNode) : BoxDimensions {
    // This assumes children boxes are already up-to-date
    // This would only occur when propogating thus this node will not be hidden

    var children = findConnections(parent).children;

    let pBox = { width: 0, xOffset: 0 };
    children.forEach(child=>{
        pBox.width += getBox(child.widget).width;
    });
    pBox.width += (children.length-1) * margin.horizontal;
    pBox.xOffset = calcXOffset(pBox.width, parent.width, children);
    return setBox(parent, pBox);
}

function setBox(widget: WidgetNode, box: BoxDimensions) {
    setState(widget, "box", box);
    return box;
}

function getBox(widget: WidgetNode): BoxDimensions {
    let box = getState<BoxDimensions>(widget, "box");
    if (box == null) {
        box = updateBox(widget);
    }
    return box;
}

function moveChildrenByBoxDim(anchor: WidgetNode) {
    var children = findConnections(anchor).children;
    let storedHeight = getState<number>(anchor, "heightWOTip");
    let widgetHeight = storedHeight ? storedHeight : anchor.height;
    var y = anchor.y + widgetHeight + margin.vertical;

    var startingX = anchor.x - getBox(anchor).xOffset + (children.length > 0 ? getBox(children[0].widget).xOffset : 0);

    for (let i = 0; i < children.length; i++) {
        let child = children[i];
        child.widget.y = y;

        if (i == 0) {
            child.widget.x = startingX; // + selfOffset;
        } else {
            let prevChild = children[i - 1];
            let prevChildBox = getBox(prevChild.widget);
            let prevChildXRight = prevChild.widget.x - prevChildBox.xOffset + prevChildBox.width;

            child.widget.x = prevChildXRight + margin.horizontal + getBox(child.widget).xOffset;
        }
        moveChildrenByBoxDim(child.widget);
    }
}

export function collapse(widget: WidgetNode) {
    var children = findConnections(widget).children;
    children.forEach(el => {
        collapse(el.widget);
        el.widget.visible = false;
        el.connector.visible = false;
    });
    setState(widget, "childrenCount", children.length);
    if (children.length > 0) setState(widget, "hideChildren", true);
    return children.length;
}

export function expand(widget: WidgetNode, recursive?: boolean) {
    var children = findConnections(widget).children;
    children.forEach(el => {
        el.widget.visible = true;
        el.connector.visible = true;
        if (recursive) expand(el.widget, recursive);
    });
    setState(widget, "hideChildren", false);
    return children.length;
}

export function cascadeLayoutChange(widget: WidgetNode) {
    let prevBox = getBox(widget);
    let currBox = updateBox(widget);
    if (prevBox && prevBox.width == currBox.width && prevBox.xOffset == currBox.xOffset) {
        reposition(widget, "down"); // even if the box dimensions don't change, the nodes positions might have been manually
        return;
    } else {
        reposition(widget, "down"); // needed coz when expanding anchor, the box changes.
        reposition(widget, "across");
        reposition(widget, "up");
    }
}

function reposition(widget: WidgetNode, direction: "down" | "up" | "across") {
    switch (direction) {
        case "down": {
            moveChildrenByBoxDim(widget);
            break;
        }

        case "across": {
            let parents = findConnections(widget).parents;
            if (parents.length <= 0) break;

            let siblings = findConnections(parents[0].widget).children;
            siblings.sort((a, b) => a.widget.x - b.widget.x);

            let self = siblings.find(e => e.widget.id == widget.id);
            if (self == null) throw new Error("Can't find myself in parent's children!");
            let currPos = siblings.indexOf(self);

            // move the ones on the left
            for (let i = currPos - 1; i >= 0; i--) {
                let move = siblings[i];
                let ref = siblings[i + 1];
                let refBox = getBox(ref.widget);
                let moveBox = getBox(move.widget);
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
                let move = siblings[i];
                let ref = siblings[i - 1];
                let refBox = getBox(ref.widget);
                let moveBox = getBox(move.widget);
                move.widget.x = ref.widget.x - refBox.xOffset + refBox.width + margin.horizontal + moveBox.xOffset;
                moveChildrenByBoxDim(move.widget);
            }

            break;
        }

        case "up": {
            let parents = findConnections(widget).parents;
            if (parents.length <= 0) break;

            let parent = parents[0];
            let parentBox = updateParentBox(parent.widget);
            let siblings = findConnections(parent.widget).children;
            let first = siblings[0];
            let last = siblings[siblings.length - 1];
            let lastBox = getBox(last.widget);
            let siblingSpread =
                parentBox.width - getBox(first.widget).xOffset - (lastBox.width - lastBox.xOffset - last.widget.width);
            let parentXOffset = (siblingSpread - parent.widget.width) / 2;
            parent.widget.x = siblings[0].widget.x + parentXOffset;

            reposition(parent.widget, "across");
            reposition(parent.widget, "up");

            break;
        }
        default:
            break;
    }
}
